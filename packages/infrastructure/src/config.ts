/**
 * Environment configuration, read once and validated at startup.
 *
 * Reading `process.env` scattered through the codebase means a missing
 * credential surfaces as a confusing runtime failure deep inside a Firestore
 * call. Reading it here means it surfaces as a clear message at boot.
 *
 * The split below mirrors .env.local: anything under `publicConfig` is
 * compiled into the browser bundle and is public by design; anything under
 * `serverConfig` must never be.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Safe to reference from client components. */
export const publicConfig = {
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
  },
  cloudinary: {
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '',
  },
  recaptcha: {
    // Public by design — the site key only identifies which widget to render.
    // The SECRET key is what verifies a token, and it never leaves the server.
    siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '',
  },
} as const;

/**
 * Server-only. Importing this from a client component is a build error in
 * Next.js because the values are absent from the browser bundle — which is
 * the intended behaviour, not an inconvenience.
 */
export function getServerConfig() {
  return {
    firebaseAdmin: {
      projectId: required('NEXT_PUBLIC_FIREBASE_PROJECT_ID', publicConfig.firebase.projectId),
      clientEmail: required('FIREBASE_ADMIN_CLIENT_EMAIL', process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
      // Private keys are stored with literal \n escapes in .env files.
      privateKey: required('FIREBASE_ADMIN_PRIVATE_KEY', process.env.FIREBASE_ADMIN_PRIVATE_KEY).replace(
        /\\n/g,
        '\n',
      ),
    },
    cloudinary: {
      cloudName: required('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', publicConfig.cloudinary.cloudName),
      apiKey: required('CLOUDINARY_API_KEY', process.env.CLOUDINARY_API_KEY),
      apiSecret: required('CLOUDINARY_API_SECRET', process.env.CLOUDINARY_API_SECRET),
    },
    mail: {
      /*
       * Gmail SMTP, not Firebase's built-in reset email.
       *
       * Firebase sends a fixed template nobody can brand. Owning the send
       * means owning the wording, the logo and the tone — which for a company
       * asking people to part with ₱50,000 is not decoration.
       *
       * `GMAIL_APP_PASSWORD` is an App Password from a Google account with
       * 2-Step Verification enabled. The account password will not work.
       */
      /*
       * NOT `required()`, deliberately.
       *
       * `getServerConfig()` is read by every Firestore and Cloudinary call in
       * both apps. Demanding SMTP credentials here made a missing
       * GMAIL_USER take down unit browsing, project pages and the reservation
       * flow — none of which send email. The check belongs where the credential
       * is USED, so a mail misconfiguration breaks mail and nothing else.
       *
       * `getMailTransport()` validates these before its first send.
       */
      user: process.env.GMAIL_USER ?? '',
      appPassword: process.env.GMAIL_APP_PASSWORD ?? '',
      /** Display name on the From: header. */
      fromName: process.env.MAIL_FROM_NAME ?? 'St. Francis Square Realty',
    },
    vision: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID ?? publicConfig.firebase.projectId,
      credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
    },
  };
}

export type ServerConfig = ReturnType<typeof getServerConfig>;
