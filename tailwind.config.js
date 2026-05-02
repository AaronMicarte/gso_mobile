/** @type {import('tailwindcss').Config} */
module.exports = {
    presets: [require('nativewind/preset')],
    content: ['./src/**/*.{ts,tsx}', './App.tsx'],
    theme: {
        extend: {
            colors: {
                gso: {
                    ink: '#0F172A',
                    slate: '#334155',
                    blue: '#2563EB',
                    gold: '#B45309',
                    cream: '#F8FAFC',
                },
            },
            fontFamily: {
                sans: ['Inter', 'System'],
            },
        },
    },
    plugins: [],
};