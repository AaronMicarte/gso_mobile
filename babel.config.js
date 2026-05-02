module.exports = function (api) {
    api.cache(true);
    const isTest = process.env.NODE_ENV === 'test' || process.env.BABEL_ENV === 'test';

    return {
        presets: ['babel-preset-expo'],
        // Keep Babel plugins minimal for SDK54 compatibility.
        plugins: isTest ? [] : ['react-native-reanimated/plugin'],
    };
};
