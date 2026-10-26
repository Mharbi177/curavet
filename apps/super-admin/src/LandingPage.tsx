import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Sparkles, MessageCircle, Calendar, Users, Globe, ChevronRight,
  CheckCircle2, Send, ArrowRight, Zap, Shield, HeartPulse, Activity,
  Stethoscope, Clock, AlertTriangle, PhoneCall, Check, Star
} from 'lucide-react';

// --- CHAT DEMO WIDGET ---
function ChatDemo() {
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: "Hello! 👋 I'm CuraVet, your 24/7 veterinary clinic assistant. I can schedule appointments, answer treatment questions, or assist with urgent triage for your companion.\n\nTry asking: *'Can I book a rabies vaccine and wellness check for my dog Buster tomorrow?'*"
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  
  const [sessionId] = useState(() => 'vet_demo_' + Math.random().toString(36).substring(2, 10));
  const DEMO_WIDGET_KEY = 'wgt_curavet_demo';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleExampleClick = (e: any) => {
      setInput(e.detail);
    };
    window.addEventListener('demoQuerySelect', handleExampleClick);
    return () => window.removeEventListener('demoQuerySelect', handleExampleClick);
  }, []);

  const send = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const apiUrl =
        (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_URL ||
        'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/public/widget/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: DEMO_WIDGET_KEY,
          sessionId,
          message: userMsg
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get response');
      setMessages(prev => [...prev, { role: 'bot', text: data.reply }]);
    } catch (err) {
      // Realistic simulated response for demo
      setTimeout(() => {
        let reply = "I'd be delighted to help with Buster! 🐾 Dr. Sarah Mitchell has openings tomorrow for a Comprehensive Wellness & Rabies Vaccine at 10:30 AM or 2:15 PM. Which time works best for you?";
        if (userMsg.toLowerCase().includes('emergency') || userMsg.toLowerCase().includes('poison') || userMsg.toLowerCase().includes('breathing')) {
          reply = "🚨 CRITICAL TRIAGE NOTICE: If Buster is showing signs of acute distress, poison ingestion, or labored breathing, please do not wait for a scheduled visit. Please bring him immediately to our emergency entrance or call our 24/7 hotline at +1-800-CURA-VET right away!";
        }
        setMessages(prev => [...prev, { role: 'bot', text: reply }]);
        setIsTyping(false);
      }, 700);
      return;
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-emerald-500/20 w-full max-w-sm mx-auto relative z-10 backdrop-blur-xl">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 p-1 flex items-center justify-center border border-white/20">
            <HeartPulse className="w-5 h-5 text-emerald-200 animate-pulse" />
          </div>
          <div>
            <p className="text-white font-bold text-sm tracking-wide flex items-center gap-1.5">
              CuraVet AI Concierge
            </p>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-300 rounded-full animate-ping" />
              <p className="text-emerald-100 text-xs font-medium">Triage & Scheduling Active</p>
            </div>
          </div>
        </div>
        <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-black/20 text-emerald-100 rounded-full">
          Live AI
        </span>
      </div>

      <div className="h-96 overflow-y-auto p-4 flex flex-col gap-3 bg-slate-950/70">
        {messages.map((m, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            key={i} 
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] px-4 py-2.5 text-xs whitespace-pre-wrap leading-relaxed shadow-md
              ${m.role === 'user'
                ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-sm font-medium'
                : 'bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-2xl rounded-tl-sm'}`}
            >
              {m.text}
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-2xl text-xs text-slate-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask to book vaccines, exams, triage..."
          className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
        />
        <button 
          onClick={send}
          disabled={!input.trim() || isTyping}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white p-2 rounded-xl transition-all shadow-lg shadow-emerald-900/30"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function LandingPage() {
  const triggerQuery = (text: string) => {
    window.dispatchEvent(new CustomEvent('demoQuerySelect', { detail: text }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white relative overflow-hidden">
      
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-emerald-600/15 via-teal-500/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute top-96 right-0 w-[500px] h-[500px] bg-emerald-500/5 blur-3xl pointer-events-none" />

      {/* --- TOP NAVBAR --- */}
      <nav className="relative z-20 max-w-7xl mx-auto px-6 h-20 flex items-center justify-between border-b border-slate-800/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="CuraVet" className="w-10 h-10 rounded-xl shadow-lg shadow-emerald-500/20 object-contain" />
          <div className="flex flex-col">
            <span className="font-extrabold text-xl tracking-tight text-white flex items-center gap-1.5">
              Cura<span className="text-emerald-400">Vet</span>
            </span>
            <span className="text-[10px] tracking-wider text-emerald-400 uppercase font-semibold">
              Veterinary AI Platform
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#features" className="hover:text-emerald-400 transition-colors">Capabilities</a>
          <a href="#triage" className="hover:text-emerald-400 transition-colors">Emergency Triage</a>
          <a href="#preview" className="hover:text-emerald-400 transition-colors">Practice Dashboard</a>
          <a href="#benefits" className="hover:text-emerald-400 transition-colors">Why CuraVet</a>
        </div>

        <div className="flex items-center gap-3">
          <Link 
            to="/login"
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          >
            Clinic Sign In
          </Link>
          <a 
            href="#demo"
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/25 flex items-center gap-1.5"
          >
            Launch Demo <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-24 lg:pt-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Headlines & Value Prop */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Next-Gen Practice Automation for Animal Hospitals</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] text-white">
              The 24/7 AI Receptionist & Triage for <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">Veterinary Clinics</span>.
            </h1>

            <p className="text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed">
              Automate WhatsApp, Instagram, and web inquiries into confirmed veterinary visits. With built-in clinical emergency triage, race-free doctor scheduling, and patient record tracking.
            </p>

            {/* Quick Demo Prompts */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Click to test live AI triage:
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  "🐶 Book Buster's annual vaccines for tomorrow",
                  "🐱 How much is dental scaling for a cat?",
                  "🚨 Emergency: My dog ate chocolate!"
                ].map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => triggerQuery(q)}
                    className="text-xs bg-slate-900/80 hover:bg-emerald-950/70 border border-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-300 px-3 py-1.5 rounded-lg transition-all text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-800/80 max-w-lg">
              <div>
                <p className="text-2xl font-black text-emerald-400">24 / 7</p>
                <p className="text-xs text-slate-400">Instant AI Replies</p>
              </div>
              <div>
                <p className="text-2xl font-black text-teal-300">0</p>
                <p className="text-xs text-slate-400">Double Bookings</p>
              </div>
              <div>
                <p className="text-2xl font-black text-cyan-300">&lt; 2s</p>
                <p className="text-xs text-slate-400">WhatsApp Latency</p>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual & Live Interactive Chat */}
          <div className="lg:col-span-5 relative">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/30 to-teal-500/30 blur-xl opacity-70" />
            <div className="relative">
              <ChatDemo />
            </div>
          </div>

        </div>
      </section>

      {/* --- HERO IMAGE BANNER --- */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <div className="relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl group">
          <img 
            src="/hero.jpg" 
            alt="Modern CuraVet Clinic" 
            className="w-full h-80 sm:h-96 lg:h-[460px] object-cover object-center brightness-95 group-hover:scale-105 transition-transform duration-700" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
          
          <div className="absolute bottom-8 left-8 right-8 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 text-emerald-300 text-xs font-bold">
                <HeartPulse className="w-3.5 h-3.5" /> Compassionate Animal Health Automation
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Engineered for Modern Veterinary Hospitals
              </h2>
              <p className="text-sm text-slate-300">
                Give your doctors, veterinary nurses, and receptionists their time back while giving pet parents instant, caring service at any hour.
              </p>
            </div>
            <a 
              href="#preview"
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 flex-shrink-0"
            >
              Explore Practice Portal <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* --- DASHBOARD PREVIEW SECTION --- */}
      <section id="preview" className="relative z-10 py-20 bg-slate-900/50 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
              Practice Management & Triage Portal
            </h2>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-white">
              Full Visibility Into Patient Health & Appointments
            </h3>
            <p className="text-slate-400 text-sm">
              An all-in-one clinical workspace designed for multi-doctor veterinary practices. Track patient species, vaccination statuses, surgical bookings, and incoming chat streams.
            </p>
          </div>

          <div className="relative rounded-3xl overflow-hidden border border-emerald-500/20 shadow-2xl bg-slate-950 p-2 sm:p-4">
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 blur-3xl pointer-events-none" />
            <img 
              src="/dashboard-preview.jpg" 
              alt="CuraVet Dashboard Interface" 
              className="w-full rounded-2xl shadow-2xl border border-slate-800/80 object-cover" 
            />
          </div>

        </div>
      </section>

      {/* --- CORE FEATURES GRID --- */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-24 space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <span className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
            Tailored Specifically For Vets
          </span>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-white">
            Everything Your Clinic Needs To Scale
          </h3>
          <p className="text-slate-400 text-sm">
            Built from the ground up to solve the real operational bottlenecks of animal hospitals and companion pet practices.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Card 1: Emergency Triage */}
          <div className="bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 space-y-4 transition-all hover:bg-slate-900/90 group">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-white">Clinical Emergency Triage</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Detects life-threatening symptoms (bloat, seizures, toxic ingestion, trauma) and immediately escalates the owner to your emergency hospital line.
            </p>
          </div>

          {/* Card 2: Pet & Patient CRM */}
          <div className="bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 space-y-4 transition-all hover:bg-slate-900/90 group">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <HeartPulse className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-white">Patient (Pet) Profiles</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tracks pet species, breeds, weight, microchips, and medical allergies linked directly to appointment records and doctor notes.
            </p>
          </div>

          {/* Card 3: Omnichannel WhatsApp */}
          <div className="bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 space-y-4 transition-all hover:bg-slate-900/90 group">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:scale-110 transition-transform">
              <MessageCircle className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-white">WhatsApp & Instagram AI</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pet owners message on their preferred apps. The AI answers FAQs, quotes fees, verifies availability, and books appointments 24/7.
            </p>
          </div>

          {/* Card 4: Doctor Shift Management */}
          <div className="bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 space-y-4 transition-all hover:bg-slate-900/90 group">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
              <Calendar className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-white">Race-Free Concurrency</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Prevents double bookings across multiple doctors and surgical suites. Automatically handles staff shift breaks and room allocation.
            </p>
          </div>

          {/* Card 5: Automated Reminders */}
          <div className="bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 space-y-4 transition-all hover:bg-slate-900/90 group">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
              <Clock className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-white">Vaccine & Visit Reminders</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automated 24h & 1h WhatsApp visit reminders reduce clinic no-shows to under 2%. Proactive booster alerts bring patients back on schedule.
            </p>
          </div>

          {/* Card 6: Prepayments & Deposits */}
          <div className="bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 space-y-4 transition-all hover:bg-slate-900/90 group">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <Zap className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-white">Surgical Prepayment Deposits</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Collect upfront deposits via Stripe on WhatsApp for high-value surgical slots and dental cleanings, securing doctor calendar time.
            </p>
          </div>

        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="relative z-10 border-t border-slate-800 bg-slate-950/80 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="CuraVet" className="w-8 h-8 rounded-lg object-contain" />
            <span className="font-bold text-sm text-white">CuraVet &copy; 2026</span>
          </div>
          <p className="text-xs text-slate-500 text-center sm:text-right">
            Autonomous Practice Management & Clinical Triage for Animal Hospitals.
          </p>
        </div>
      </footer>

    </div>
  );
}

export default LandingPage;
