/**
 * This code is closed source and Confidential and Proprietary to
 * Appcelerator, Inc. All Rights Reserved.  This code MUST not be
 * modified, copy or otherwise redistributed without expression
 * written permission of Appcelerator. This file is licensed as
 * part of the Appcelerator Platform and governed under the terms
 * of the Appcelerator license agreement.
 */
var exec = require('child_process').exec;

module.exports = function(grunt) {

    require('load-grunt-tasks')(grunt); // npm install --save-dev load-grunt-tasks

    // Project configuration.
    grunt.initConfig({
        jshint: {
            options: {
                jshintrc: true
            },
            src: ['lib/*.js']
        },
        jscs: {
            options: {
                config: ".jscsrc"
            },
            src: ['lib/*.js']
        }        
    });

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-jscs');

    grunt.registerTask('default', ['jshint', 'jscs']);
};
