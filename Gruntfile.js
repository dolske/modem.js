module.exports = function(grunt) {

    // load npm tasks for grunt-* libs, excluding grunt-cli
    require('matchdep').filterDev('grunt-*').filter(function(pkg) {
      return ['grunt-cli'].indexOf(pkg) < 0;
    }).forEach(grunt.loadNpmTasks);

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        watch: {
            options : {
                livereload: true
            },
            source: {
                files: [
                    'src/*.js',
                    'src/*/*.js',
                    'demo/demo.js',
                    'demo/demo-ui.js',
                    'Gruntfile.js'
                ],
                tasks: [ 'browserify',  'build:js' ]
            }
        },

        concat: {
            dist: {
                src: [
                    'src/*.js',
                    'src/*/*.js'
                ],
                dest: 'dist/modem.js',
            }
        },

        browserify: {
            dist: {
                src: ['src/index.js'],
                dest: 'dist/modem-bundle.js'
            },
            demo: {
                src: ['demo/demo-ui.js'],
                dest: 'demo/bundle.js'
            }
        }
    });

    /* Default (development): Watch files and build on change. */
    grunt.registerTask('default', ['watch']);

    grunt.registerTask('build', [
        'concat:dist'
    ]);

};
