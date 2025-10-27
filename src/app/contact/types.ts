import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export enum FormFieldId {
  Name = 'name',
  Email = 'email',
  Message = 'message',
}

export enum InputType {
  Text = 'text',
  Email = 'email',
}

export enum SubmitStatus {
  Success = 'success',
  Error = 'error',
}

export interface State {
  [FormFieldId.Name]: string;
  [FormFieldId.Email]: string;
  [FormFieldId.Message]: string;
  submitStatus: SubmitStatus | null;
  errorMessage: string;
}

export type Action =
  | { type: 'SET_FIELD'; field: FormFieldId; value: string }
  | { type: 'SET_SUBMIT_STATUS'; status: SubmitStatus | null }
  | { type: 'SET_ERROR_MESSAGE'; message: string }
  | { type: 'RESET_FORM' }
  | { type: 'SET_SUBMIT_RESULT'; status: SubmitStatus; message?: string; resetForm?: boolean };

export type FormFieldConfig = {
  id: FormFieldId;
  label?: string;
  type?: InputType;
  placeholder?: string;
  Component: typeof Input | typeof Textarea;
};

export const initialState: State = {
  [FormFieldId.Name]: '',
  [FormFieldId.Email]: '',
  [FormFieldId.Message]: '',
  submitStatus: null,
  errorMessage: '',
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_SUBMIT_STATUS':
      return { ...state, submitStatus: action.status };
    case 'SET_ERROR_MESSAGE':
      return {
        ...state,
        errorMessage: action.message,
      };
    case 'RESET_FORM':
      return {
        ...state,
        [FormFieldId.Name]: '',
        [FormFieldId.Email]: '',
        [FormFieldId.Message]: '',
      };
    case 'SET_SUBMIT_RESULT': {
      const newState = {
        ...state,
        submitStatus: action.status,
        errorMessage: action.message || '',
      };

      if (action.resetForm) {
        return {
          ...initialState,
          submitStatus: action.status,
        };
      }

      return newState;
    }
    default:
      return state;
  }
}
