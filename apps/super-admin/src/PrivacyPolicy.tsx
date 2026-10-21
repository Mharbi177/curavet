import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-brand transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        <h1 className="text-3xl font-extrabold text-slate-900 mb-6">Privacy Policy</h1>
        <div className="prose prose-slate max-w-none">
          <p className="text-sm text-slate-500 mb-8">Last updated: {new Date().toLocaleDateString()}</p>
          
          <h2 className="text-xl font-bold text-slate-800 mt-8 mb-4">1. Information We Collect</h2>
          <p className="text-slate-600 mb-4">
            We collect information you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us.
          </p>

          <h2 className="text-xl font-bold text-slate-800 mt-8 mb-4">2. How We Use Information</h2>
          <p className="text-slate-600 mb-4">
            We may use the information we collect about you to provide, maintain, and improve our services, including, for example, to facilitate payments, send receipts, provide products and services you request, and develop new features.
          </p>

          <h2 className="text-xl font-bold text-slate-800 mt-8 mb-4">3. Sharing of Information</h2>
          <p className="text-slate-600 mb-4">
            We may share the information we collect about you as described in this Statement or as described at the time of collection or sharing, including as follows: with third party Service Providers; in response to a request for information by a competent authority if we believe disclosure is in accordance with, or is otherwise required by, any applicable law, regulation, or legal process.
          </p>
        </div>
      </div>
    </div>
  );
}
