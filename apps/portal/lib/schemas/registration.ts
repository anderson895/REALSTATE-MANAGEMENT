import { z } from 'zod';
import {
  SEX_OPTIONS,
  isOfLegalAge,
  normalizeMobile,
  validatePassword,
  validateUsername,
} from '@sfsr/domain';

/**
 * Registration form contract, field-for-field from the Registration Page in
 * RESERVATION.doc.
 *
 * The rules themselves live in `@sfsr/domain/policies` — this only wraps them
 * for zod. The same schema validates in the browser AND again in the route
 * handler: client-side validation is a convenience, never a control (§3.3).
 *
 * zod lives here rather than in the domain package so that package keeps its
 * zero-dependency property and can run in any environment unchanged.
 */

const required = (label: string) => z.string().trim().min(1, `${label} is required.`);

export const registrationSchema = z
  .object({
    // ── Personal Information ──
    firstName: required('First name').max(60),
    middleName: z.string().trim().max(60).optional().or(z.literal('')),
    lastName: required('Last name').max(60),
    suffix: z.string().trim().max(10).optional().or(z.literal('')),

    dateOfBirth: required('Date of birth').refine(
      (value) => !Number.isNaN(Date.parse(value)),
      'Enter a valid date.',
    ),

    sex: z.enum(SEX_OPTIONS),

    mobile: required('Mobile number').refine(
      (value) => normalizeMobile(value) !== null,
      'Enter a valid Philippine mobile number, e.g. 0917 810 1001.',
    ),

    email: required('Email address').pipe(z.email('Enter a valid email address.')),

    // ── Account Credentials ──
    // superRefine rather than refine: zod 4 dropped the function form of the
    // message argument, and the policy returns a specific reason (too short,
    // too long, illegal character) worth surfacing verbatim.
    username: required('Username').superRefine((value, ctx) => {
      for (const violation of validateUsername(value)) {
        ctx.addIssue({ code: 'custom', message: violation.message });
      }
    }),

    password: required('Password').refine(
      (value) => validatePassword(value).length === 0,
      'Password does not meet all requirements.',
    ),

    confirmPassword: required('Please confirm your password'),

    // ── Verification ──
    //
    // A reCAPTCHA token, not a checkbox. The previous `z.literal(true)` was
    // satisfied by any bot posting `true`; only the server-side verification
    // against Google actually proves anything (§12.33).
    recaptchaToken: z
      .string()
      .trim()
      .min(1, 'Please complete the "I am not a robot" check.'),

    // ── Privacy Consent — all three are required by RESERVATION.doc ──
    certifyTruthful: z.literal(true, {
      message: 'You must certify that the information provided is true and correct.',
    }),
    acceptTerms: z.literal(true, {
      message: 'You must accept the Terms and Conditions and Privacy Policy.',
    }),
    dataPrivacyConsent: z.literal(true, {
      message: 'Data Privacy Act consent is required to process your reservation.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine(
    (data) => {
      const dob = new Date(data.dateOfBirth);
      return Number.isNaN(dob.getTime()) || isOfLegalAge(dob, new Date());
    },
    {
      // A reservation leads to a Contract to Sell, which a minor cannot
      // validly enter into. See Development Plan.md §12.32.
      message: 'You must be at least 18 years old to reserve a unit.',
      path: ['dateOfBirth'],
    },
  );

export type RegistrationInput = z.infer<typeof registrationSchema>;
