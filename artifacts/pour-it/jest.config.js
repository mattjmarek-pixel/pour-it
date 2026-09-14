/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: { module: 'commonjs', esModuleInterop: true, jsx: 'react-jsx' } },
    ],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Workspace packages export TS source; point jest straight at it so
    // ts-jest transforms it (node_modules is not transformed by default).
    '^@workspace/thc-legal-states$':
      '<rootDir>/../../lib/thc-legal-states/src/index.ts',
    // Use the single hoisted SDK 55-compatible React copy for all tests.
    '^react$': '<rootDir>/../../node_modules/react',
    '^react/(.*)$': '<rootDir>/../../node_modules/react/$1',
  },
};
