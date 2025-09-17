'use client';
import React, { useReducer, useTransition, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader, X } from 'lucide-react';
import { FormFieldId, InputType, State, SubmitStatus, initialState, reducer, type FormFieldConfig } from './types';

const formFields: FormFieldConfig[] = [
  {
    id: FormFieldId.Name,
    label: 'Name',
    type: InputType.Text,
    Component: Input,
  },
  {
    id: FormFieldId.Email,
    label: 'Email Address',
    type: InputType.Email,
    Component: Input,
  },
  {
    id: FormFieldId.Message,
    label: 'Message',
    Component: Textarea,
  },
];

const getFormFieldValue = (state: State, id: FormFieldId): string => {
  return state[id];
};

export function ContactForm() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isPending, startTransition] = useTransition();
  const [isVisible, setIsVisible] = useState(false);
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
        {formFields.map(({ id, label, type, Component }) => (
          <div key={id}>
            <label htmlFor={id} className="mb-2 block text-white">
              {label}
            </label>
            <Component
              id={id}
              name={id}
              type={type}
              value={getFormFieldValue(state, id as FormFieldId)}
              onChange={(e) =>
                dispatch({
                  type: 'SET_FIELD',
                  field: id as FormFieldId,
                  value: e.target.value,
                })
              }
              required
              className="bg-white text-black"
            />
          </div>
        ))}

        <Button type="submit" className="bg-white text-black hover:bg-gray-200" disabled={isPending}>
          {isPending ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            'Send'
          )}
        </Button>
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