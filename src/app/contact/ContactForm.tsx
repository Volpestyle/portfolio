'use client';
import React, { useReducer, useTransition, useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { AnimatedSendButton } from '@/components/ui/AnimatedSendButton';
import { FormFieldId, InputType, State, SubmitStatus, initialState, reducer, type FormFieldConfig } from './types';

const formFields: FormFieldConfig[] = [
  {
    id: FormFieldId.Name,
    type: InputType.Text,
    Component: Input,
    placeholder: 'name...',
  },
  {
    id: FormFieldId.Email,
    type: InputType.Email,
    Component: Input,
    placeholder: 'email...',
  },
  {
    id: FormFieldId.Message,
    Component: Textarea,
    placeholder: 'message...',
  },
];

const getFormFieldValue = (state: State, id: FormFieldId): string => {
  return state[id];
};

export function ContactForm() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isPending, startTransition] = useTransition();
  const [isVisible, setIsVisible] = useState(false);
  const [messageHeight, setMessageHeight] = useState(120);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const {
    [FormFieldId.Name]: name,
    [FormFieldId.Email]: email,
    [FormFieldId.Message]: message,
    submitStatus,
    errorMessage,
  } = state;

  useEffect(() => {
    if (submitStatus) {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    }
  }, [submitStatus]);

  useEffect(() => {
    const textarea = messageRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.max(120, textarea.scrollHeight);
      textarea.style.height = `${newHeight}px`;
      setMessageHeight(newHeight);
    }
  }, [message]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dispatch({ type: 'SET_SUBMIT_STATUS', status: null });
    dispatch({ type: 'SET_ERROR_MESSAGE', message: '' });
    setIsVisible(false);

    startTransition(async () => {
      try {
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, email, message }),
        });
        const data = await response.json();

        if (!response.ok) {
          console.error('Email API Error:', {
            status: response.status,
            data,
          });
          dispatch({
            type: 'SET_SUBMIT_RESULT',
            status: SubmitStatus.Error,
            message: data.error || 'Failed to send message. Please try again later.',
          });
        } else {
          dispatch({
            type: 'SET_SUBMIT_RESULT',
            status: SubmitStatus.Success,
            resetForm: true,
          });
        }
      } catch (error) {
        console.error('Email submission error:', error);
        dispatch({
          type: 'SET_SUBMIT_RESULT',
          status: SubmitStatus.Error,
          message: 'An unexpected error occurred. Please try again later.',
        });
      }
    });
  };

  const handleDismissNotification = () => {
    setIsVisible(false);
  };

  const handleAnimationEnd = () => {
    if (!isVisible) {
      dispatch({ type: 'SET_SUBMIT_STATUS', status: null });
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {formFields.map(({ id, label, type, Component, placeholder }) => {
          const isMessage = id === FormFieldId.Message;
          const baseProps = {
            id,
            name: id,
            type,
            value: getFormFieldValue(state, id as FormFieldId),
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              dispatch({
                type: 'SET_FIELD',
                field: id as FormFieldId,
                value: e.target.value,
              }),
            required: true,
            disabled: isPending,
            className: isMessage
              ? 'min-h-[120px] max-h-[300px] overflow-y-auto rounded-lg border-gray-700 bg-black/50 text-white backdrop-blur-sm transition-all duration-200 placeholder:text-gray-500 hover:border-gray-600 focus:outline-none disabled:opacity-50'
              : 'h-10 rounded-lg border-gray-700 bg-black/50 text-white backdrop-blur-sm transition-all duration-200 placeholder:text-gray-500 hover:border-gray-600 focus:outline-none disabled:opacity-50',
            style: isMessage ? { resize: 'none' as const } : undefined,
            placeholder,
          };

          return (
            <div key={id}>
              <label htmlFor={id} className="mb-2 block text-sm text-white/80">
                {label}
              </label>
              {isMessage ? <Textarea {...baseProps} ref={messageRef} /> : <Component {...baseProps} />}
            </div>
          );
        })}

        <div className="flex items-end justify-end">
          <AnimatedSendButton disabled={isPending} height={40} />
        </div>
      </form>

      {submitStatus && (
        <div
          className={`relative mt-4 inline-flex items-center rounded-md p-3 transition-all duration-300 ease-in-out ${
            submitStatus === SubmitStatus.Success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
          } ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}
          onTransitionEnd={handleAnimationEnd}
        >
          <span className="mr-2">
            {submitStatus === SubmitStatus.Success ? 'Message sent successfully!' : errorMessage}
          </span>
          <button
            onClick={handleDismissNotification}
            className="rounded-full p-1.5 transition-colors hover:bg-black/10"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
