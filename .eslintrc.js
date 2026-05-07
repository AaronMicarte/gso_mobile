module.exports = {
    root: true,
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react-hooks/recommended',
        'plugin:prettier/recommended',
        'prettier'
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true
        }
    },
    plugins: ['@typescript-eslint', 'react-hooks', 'prettier'],
    env: {
        es2021: true,
        node: true
    },
    settings: {
        react: {
            version: 'detect'
        }
    },
    rules: {
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-function-return-types': 'off',
        'react-hooks/set-state-in-effect': 'off',
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'prettier/prettier': 'warn'
    },
    ignorePatterns: [
        'dist',
        'node_modules',
        '.expo',
        '.eslintrc.js'
    ]
};
