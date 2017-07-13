// karma.conf.js
module.exports = function (config) {
    config.set({
        frameworks: ['jspm', 'mocha', 'chai'],

        plugins: ['karma-mocha', 'karma-chai', 'karma-jspm'],

        files: [

        ],
        dev: {
            // On our local environment we want to test all the things!
            browsers: ['Chrome']
        },
        jspm: {
            // Edit this to your needs 
            loadFiles: ['lib/**/*.js', 'lib_test/**/*.js'],
            config: "system.config.js",
            packages: "jspm_packages/",
        },
        proxies: {
            '/lib/': '/base/lib/',
            '/lib_test/': '/base/lib_test/',
            '/jspm_packages/': '/base/jspm_packages/'
        },
        client: {
            mocha: {
                // change Karma's debug.html to the mocha web reporter
                reporter: 'html',

                // require specific files after Mocha is initialized
                require: [],

                // custom ui, defined in required file above
            }
        },
        autoWatch: true
    });
};