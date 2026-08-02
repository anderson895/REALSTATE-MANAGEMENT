import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * Packages the domain layer must never import.
 * See Development Plan.md §5.5 — dependencies point inward only.
 */
const INFRASTRUCTURE_PACKAGES = [
  'firebase',
  'firebase-admin',
  'cloudinary',
  '@google-cloud/vision',
  'next',
  'react',
  'react-dom',
  '@sfsr/infrastructure',
  '@sfsr/ui',
];

const config = [
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'scripts/seed/data/**',
    ],
  },

  // eslint-config-next v16 ships native flat config — no FlatCompat needed.
  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    // Both apps are App Router only. This rule hunts for a pages/ directory at
    // the monorepo root and warns when it finds none.
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  {
    // ── ARCHITECTURAL BOUNDARY ────────────────────────────────────────────
    // @sfsr/domain is shared by BOTH apps — the deployed Portal and the
    // locally run Internal system. Keeping it free of infrastructure is what
    // lets one pricing engine serve both without either app's storage or
    // framework choices leaking into the business rules.
    //
    // Breaking this inverts the dependency and makes the domain untestable
    // without an emulator. Enforced by CI, not by discipline.
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: INFRASTRUCTURE_PACKAGES.map((name) => ({
            name,
            message:
              'The domain layer must not depend on infrastructure (Development Plan.md §5.5). ' +
              'Declare an interface in packages/domain/src/repositories/ and implement it in @sfsr/infrastructure.',
          })),
          patterns: [
            {
              group: [
                'firebase/*',
                'firebase-admin/*',
                '@google-cloud/*',
                'next/*',
                '@sfsr/infrastructure/*',
                '@sfsr/ui/*',
              ],
              message:
                'The domain layer must not depend on infrastructure or UI (Development Plan.md §5.5).',
            },
          ],
        },
      ],
    },
  },

  {
    // The two apps are separate projects with separate deployment targets and
    // must not reach into each other. Anything genuinely shared goes in packages/.
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/portal/**', '**/apps/internal/**'],
              message:
                'Apps are separate projects and must not import from one another. ' +
                'Move shared code into packages/ (Development Plan.md §5.7).',
            },
          ],
        },
      ],
    },
  },

  {
    // Seed scripts are operational tooling, not application code.
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default config;
