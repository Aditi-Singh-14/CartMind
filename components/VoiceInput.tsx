'use client';

import React, { useState, useEffect, useRef } from 'react';

type VoiceInputProps = {
  onTranscriptComplete: (transcript: string) => void;
  disabled?: boolean;
};

export default function VoiceInput({ onTranscriptComplete, disabled }: VoiceInputProps) {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check browser Web Speech API support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscript(currentTranscript);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.error('Failed to initialize SpeechRecognition:', e);
      setIsSupported(false);
    }
  }, []);

  const toggleListening = () => {
    if (!isSupported || disabled || !recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      if (transcript.trim()) {
        onTranscriptComplete(transcript);
      }
    } else {
      setTranscript('');
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Error starting recognition:', err);
      }
    }
  };

  // When speech ends automatically and transcript is available, trigger callback
  useEffect(() => {
    if (!isListening && transcript.trim() !== '') {
      onTranscriptComplete(transcript);
    }
  }, [isListening]);

  if (!isSupported) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-center text-xs text-slate-500">
        🎙️ Voice input not supported in this browser.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-2">
      <button
        type="button"
        onClick={toggleListening}
        disabled={disabled}
        title={isListening ? 'Stop listening' : 'Start voice command'}
        className={`group relative flex items-center space-x-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-lg ${
          isListening
            ? 'bg-rose-600 text-white ring-4 ring-rose-500/30 animate-pulse'
            : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700'
        }`}
      >
        <div className="relative flex items-center justify-center">
          <svg
            className={`h-4 w-4 ${isListening ? 'text-white' : 'text-indigo-400 group-hover:text-indigo-300'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
          {isListening && (
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
          )}
        </div>
        <span>{isListening ? 'Listening... (Click to Send)' : '🎙️ Speak Voice Command'}</span>
      </button>

      {/* Live Transcript Display */}
      {transcript && (
        <div className="max-w-xs rounded-md bg-slate-900 border border-slate-800 px-3 py-1.5 text-center text-xs text-indigo-300 italic animate-fade-in">
          &quot;{transcript}&quot;
        </div>
      )}
    </div>
  );
}
