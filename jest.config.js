module.exports = {
    preset: 'jest-expo',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    testMatch: ['**/__tests__/**/*.test.ts?(x)'],
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/**/*.stories.tsx',
    ],
    moduleNameMapper: {
        '@/(.*)': '<rootDir>/src/$1',
        '^expo-sqlite$': '<rootDir>/src/__mocks__/expo-sqlite.ts',
    },
};
