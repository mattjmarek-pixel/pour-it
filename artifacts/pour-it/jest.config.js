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
    // pnpm symlinks make jest see two React copies (local symlink vs hoisted
    // root), which breaks the hooks dispatcher under react-test-renderer.
    // Pin every 'react' resolution to the single hoisted copy.
    '^react$': '<rootDir>/../../node_modules/react',
    '^react/(.*)$': '<rootDir>/../../node_modules/react/$1',
  },
};
