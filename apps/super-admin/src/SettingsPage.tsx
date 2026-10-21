import React, { useEffect, useState } from 'react';
import { Shield, Key, Globe, Database, Bot, Loader2, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL, apiFetch } from './api';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('ai');
  const [apiUrl, setApiUrl] = useState(API_BASE_URL);
  const [health, setHealth] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setApiUrl(API_BASE_URL);
  }, []);

  const checkHealth = async () => {
    setChecking(true);
    try {
      const result = await apiFetch<{ status: string; service: string }>('/health');
      setHealth(`${result.service}: ${result.status}`);
    } catch (err) {
      setHealth(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="ml-64 p-8 w-full max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
        <p className="text-gray-500">Configure global SaaS parameters, API keys, and security.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="flex flex-col gap-2">
          <button onClick={() => setActiveTab('ai')} className={`flex items-center gap-3 p-3 rounded-lg font-medium ${activeTab === 'ai' ? 'bg-white shadow-sm border border-brand text-brand' : 'text-gray-600 hover:bg-white hover:shadow-sm transition-all'}`}>
            <Bot className="w-5 h-5" /> AI Providers
          </button>
          <button onClick={() => setActiveTab('webhooks')} className={`flex items-center gap-3 p-3 rounded-lg font-medium ${activeTab === 'webhooks' ? 'bg-white shadow-sm border border-brand text-brand' : 'text-gray-600 hover:bg-white hover:shadow-sm transition-all'}`}>
            <Globe className="w-5 h-5 text-gray-400" /> Webhook Endpoints
          </button>
          <button onClick={() => setActiveTab('api')} className={`flex items-center gap-3 p-3 rounded-lg font-medium ${activeTab === 'api' ? 'bg-white shadow-sm border border-brand text-brand' : 'text-gray-600 hover:bg-white hover:shadow-sm transition-all'}`}>
            <Key className="w-5 h-5 text-gray-400" /> API Connectivity
          </button>
          <button onClick={() => setActiveTab('security')} className={`flex items-center gap-3 p-3 rounded-lg font-medium ${activeTab === 'security' ? 'bg-white shadow-sm border border-brand text-brand' : 'text-gray-600 hover:bg-white hover:shadow-sm transition-all'}`}>
            <Shield className="w-5 h-5 text-gray-400" /> Security & Auth
          </button>
          <button onClick={() => setActiveTab('backups')} className={`flex items-center gap-3 p-3 rounded-lg font-medium ${activeTab === 'backups' ? 'bg-white shadow-sm border border-brand text-brand' : 'text-gray-600 hover:bg-white hover:shadow-sm transition-all'}`}>
            <Database className="w-5 h-5 text-gray-400" /> Backups
          </button>
        </div>

        <div className="md:col-span-2 bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Production Configuration</h2>
            <p className="text-sm text-gray-500">Secrets live only in API environment variables. This dashboard never stores raw provider keys.</p>
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Connected API Base URL</label>
              <input type="text" value={apiUrl} readOnly className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-600" />
              <p className="text-xs text-gray-400 mt-1">Set with VITE_API_URL during deployment. Local default is http://localhost:3000.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Health</label>
              <div className="flex items-center gap-3">
                <button onClick={checkHealth} disabled={checking} className="bg-brand text-white px-5 py-2 rounded-lg font-medium hover:bg-brandHover transition-colors shadow-sm flex items-center gap-2">
                  {checking && <Loader2 className="w-4 h-4 animate-spin" />}
                  {checking ? 'Checking...' : 'Check API Health'}
                </button>
                {health && (
                  <span className="text-sm text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> {health}
                  </span>
                )}
              </div>
            </div>

            <hr className="border-gray-100" />

            <div className="text-sm text-gray-600 leading-relaxed">
              <p className="font-semibold text-gray-800 mb-2">Required production environment variables</p>
              <ul className="list-disc ml-5 flex flex-col gap-1 font-mono text-xs">
                <li>DATABASE_URL, DIRECT_URL</li>
                <li>JWT_SECRET, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD</li>
                <li>CREDENTIALS_ENCRYPTION_KEY</li>
                <li>META_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_TOKEN</li>
                <li>GROQ_API_KEY or OPENAI_API_KEY, AI_MODEL, AI_BASE_URL</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
