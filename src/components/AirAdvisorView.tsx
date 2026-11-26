import { useState } from 'react';
import { Send, RotateCcw, AlertCircle } from 'lucide-react';
import type { AdvisorMessage, HouseholdProfile, NavigationTab } from '../types/air';
import { ADVISOR_STARTER_PROMPTS } from '../data/airData';

interface AirAdvisorViewProps {
  profile: HouseholdProfile;
  messages: AdvisorMessage[];
  isSending: boolean;
  onSendMessage: (content: string) => Promise<void>;
  onClearChat: () => void;
  onNavigate: (tab: NavigationTab) => void;
}

export function AirAdvisorView({
  profile,
  messages,
  isSending,
  onSendMessage,
  onClearChat,
  onNavigate,
}: AirAdvisorViewProps) {
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draft.trim();
    if (cleaned.length < 3) {
      setInputError('Please enter a question about winter smog, indoor air, or community actions.');
      return;
    }
    setInputError(null);
    setDraft('');
    await onSendMessage(cleaned);
  };

  const handleStarterClick = async (prompt: string) => {
    if (isSending) return;
    setInputError(null);
    await onSendMessage(prompt);
  };

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  return (
    <div className="space-y-6">
      {/* Header + Household Context Strip */}
      <section className="bg-white border border-slate-200/90 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Winter Air Quality Advisor
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Ask situational questions about school commutes, indoor filtration, neighborhood wood smoke, or clean-heating switches. Responses use your household profile and explain the direct impact of each recommendation.
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearChat}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer self-start"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear Conversation</span>
            </button>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-slate-800">Active context:</span>
            <span>{profile.city}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">AQI {profile.currentAqi}</span>
            <span aria-hidden="true">·</span>
            <span>Heating: {profile.heating.replace('_', ' ')}</span>
            <span aria-hidden="true">·</span>
            <span>Commute: {profile.commute.replace('_', ' ')}</span>
            <span aria-hidden="true">·</span>
            <span>{profile.householdSize} residents</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="text-[#0F766E] font-medium hover:underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Edit Profile
          </button>
        </div>
      </section>

      {/* Conversation Container */}
      <section className="bg-white border border-slate-200/90 rounded-xl flex flex-col min-h-[460px]">
        <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[540px]">
          {messages.length === 0 ? (
            <div className="space-y-5 py-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">
                  Suggested questions for {profile.city}
                </h2>
                <p className="text-sm text-slate-600">
                  Choose a scenario below or write your own household or neighborhood question.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ADVISOR_STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isSending}
                    onClick={() => handleStarterClick(prompt)}
                    className="text-left p-4 rounded-lg border border-slate-200 bg-[#F8FAFC] hover:border-[#0F766E]/60 hover:bg-white transition-colors text-sm text-slate-800 leading-relaxed cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-xl px-5 py-4 space-y-3 ${
                    msg.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : msg.isError
                        ? 'bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B]'
                        : 'bg-[#F8FAFC] border border-slate-200/80 text-slate-800'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 text-xs ${
                      msg.role === 'user'
                        ? 'text-slate-300'
                        : msg.isError
                          ? 'text-[#991B1B]'
                          : 'text-slate-500'
                    }`}
                  >
                    <span className="font-medium">
                      {msg.role === 'user' ? 'Your Household' : 'ClearWinter Advisor'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{msg.timestamp}</span>
                  </div>

                  {msg.isError ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                        <span>{msg.content}</span>
                      </div>
                      {lastUserMessage && (
                        <button
                          type="button"
                          onClick={() => onSendMessage(lastUserMessage.content)}
                          className="px-3 py-1.5 text-xs font-medium text-[#991B1B] bg-white border border-[#FCA5A5] rounded-md hover:bg-[#FEE2E2] cursor-pointer"
                        >
                          Retry Question
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="text-sm leading-relaxed whitespace-pre-line">{msg.content}</div>
                      {msg.impactSummary && msg.impactSummary.length > 0 && (
                        <div className="pt-3 border-t border-slate-200/80 space-y-1.5">
                          <div className="text-xs font-semibold text-[#0F766E]">
                            Direct Impact of These Choices
                          </div>
                          <ul className="space-y-1 text-xs text-slate-700">
                            {msg.impactSummary.map((point, idx) => (
                              <li key={idx} className="flex gap-2 leading-relaxed">
                                <span className="font-mono text-[#0F766E] font-semibold">
                                  0{idx + 1}.
                                </span>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}

          {isSending && (
            <div className="flex items-start" aria-live="polite">
              <div className="max-w-md rounded-xl px-5 py-4 bg-[#F8FAFC] border border-slate-200/80 text-sm text-slate-600">
                Reviewing {profile.city} winter inversion conditions and drafting tailored guidance…
              </div>
            </div>
          )}
        </div>

        {/* Message Composer */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="p-4 sm:p-5 border-t border-slate-100 bg-white rounded-b-xl space-y-2"
        >
          <label htmlFor="advisor-question-input" className="sr-only">
            Ask ClearWinter Advisor a question
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="advisor-question-input"
              type="text"
              value={draft}
              aria-invalid={Boolean(inputError)}
              aria-describedby={inputError ? 'advisor-input-error' : undefined}
              onChange={(e) => {
                setDraft(e.target.value);
                if (inputError) setInputError(null);
              }}
              placeholder="Ask about school runs, DIY filters, gas stove venting, or neighborhood no-burn pledges…"
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15"
            />
            <button
              type="submit"
              disabled={isSending}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>{isSending ? 'Sending…' : 'Send'}</span>
            </button>
          </div>
          {inputError && (
            <p id="advisor-input-error" role="alert" className="text-xs text-[#B91C1C]">
              {inputError}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
