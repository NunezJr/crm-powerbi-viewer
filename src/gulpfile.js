﻿/// <binding BeforeBuild='BUILD' Clean='CLEAN' ProjectOpened='SETUP, WATCH' />

var gulp = require('gulp');
var ts = require('gulp-typescript');
var sass = require('gulp-sass');
var exec = require('child_process').exec;
var rename = require('gulp-rename');
var newer = require('gulp-newer');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');
var minifyHtml = require('gulp-htmlmin');
var preprocess = require('gulp-preprocess');
var del = require('del');
var typings = require('gulp-typings');
var bump = require('gulp-bump');
var replace = require('gulp-replace');

var config = {
	version: "0.2.0",	// Format must be on the form <major>.<minor>.<patch> => 0.1.0

	// Hardcoded build config - waiting for a more supported way of getting build/debug from VS. Work-around here http://www.myeyeson.net/gulp-js-and-browserify-with-asp-net/
	//buildConfig: 'debug',
	buildConfig: 'release',

	destPath: "wwwroot/",
	distPath: "../artifacts/dist/",
	solutionSrcPath: "../solutionSrc/",

	libFolderName: 'lib/',
	scriptFolderName: 'scripts/',

	src: {
		tsFiles: 'ts/**/*.ts',
		tsTypingFiles: ['ts/filesort.d.ts', 'typings/browser.d.ts'],
		libFiles: [
			'bower_components/adal-angular-for-crm/dist/adal.min.js',
			'bower_components/adal-angular-for-crm/dist/adal-angular.min.js',
			'bower_components/angular/angular.min.js',
			'bower_components/angular-route/angular-route.min.js',
			'bower_components/clipboard/dist/clipboard.min.js'
		],
		scssFiles: ['wwwroot/**/*.scss'],
		htmlFiles: ['wwwroot/**/*.html']
	},

	tsProject: ts.createProject('tsconfig.json', {
		noExternalResolve: false,
		sortOutput: true,
		typescript: require('typescript')
	})
};

config.dest = {
	tsFilename: 'powerBiViewer.js',
	libPath: config.destPath + config.libFolderName,
	scriptPath: config.destPath + config.scriptFolderName,
	stylePath: config.destPath
};

config.dist = {
	libPath: config.distPath + config.libFolderName,
	scriptPath: config.distPath + config.scriptFolderName,
	stylePath: config.distPath
};

////////////////////////////////

gulp.task('WATCH', function () {
	gulp.watch(config.src.tsFiles, ['build:typescript']);
	gulp.watch(config.src.scssFiles, ['build:styles']);
});


gulp.task('BUILD', ['build:setversion', 'build:libraries', 'build:typescript', 'build:styles']);

gulp.task('build:setversion', function () {
	return gulp.src(['./bower.json', './package.json', './project.json'])
		.pipe(bump({version: config.version }))
		.pipe(gulp.dest('./'));
});

gulp.task('build:libraries', ['build:setversion'], function () {
	return gulp.src(config.src.libFiles)
		.pipe(rename(makeFilenameCrmCompatible))
		.pipe(newer(config.dest.libPath))
		.pipe(gulp.dest(config.dest.libPath));
});

gulp.task('build:typescript', ['build:setversion'], function () {
	return gulp.src([].concat(config.src.tsTypingFiles, config.src.tsFiles))
		.pipe(newer(config.dest.scriptPath + '/' + config.dest.tsFilename))
		.pipe(ts(config.tsProject))
		.js
		.pipe(concat(config.dest.tsFilename))
		.pipe(gulp.dest(config.dest.scriptPath));
});

gulp.task('build:styles', ['build:setversion'], function () {
	return gulp.src(config.src.scssFiles)
		.pipe(newer({ dest: config.dest.stylePath, ext: '.css' }))
		.pipe(sass({ errLogToConsole: true, outputStyle: 'nested' })) // outputStyles: nested, expanded, compact, compressed
		.pipe(gulp.dest(config.dest.stylePath));
});


gulp.task('DIST', ['dist:libraries', 'dist:scripts', 'dist:styles', 'dist:html']);

gulp.task('dist:libraries', ['build:libraries'], function () {
	return gulp.src(config.src.libFiles)
		.pipe(rename(makeFilenameCrmCompatible))
		.pipe(newer(config.dist.libPath))
		.pipe(gulp.dest(config.dist.libPath));
});

gulp.task('dist:scripts', ['build:typescript'], function () {
	var stream = gulp.src(config.dest.scriptPath + '**/*.js')
		.pipe(newer(config.dist.scriptPath));

	if (config.buildConfig.toLowerCase() == 'release') {
		stream.pipe(uglify());
	}

	return stream.pipe(gulp.dest(config.dist.scriptPath));
});

gulp.task('dist:styles', ['build:styles'], function () {
	var stream = gulp.src(config.dest.stylePath + '**/*.css')
		.pipe(newer(config.dist.stylePath));

	if (config.buildConfig.toLowerCase() === 'release') {
		stream.pipe(minifyCss());
	}

	return stream.pipe(gulp.dest(config.dist.stylePath));
});

gulp.task('dist:html', function () {
	var stream = gulp.src(config.src.htmlFiles)
		.pipe(newer(config.distPath))
		.pipe(preprocess({ context: { NODE_ENV: config.buildConfig.toLowerCase() } }));

	if (config.buildConfig.toLowerCase() === 'release') {
		// For options see https://github.com/kangax/html-minifier
		stream.pipe(minifyHtml({
			collapseWhitespace: true,
			removeComments: true,
			minifyCSS: true,
			minifyJS: false
		}));
	}

	return stream.pipe(gulp.dest(config.distPath));
});

gulp.task('DEPLOY-TO-CRM', ['DIST'], function (cb) {
	exec('..\\artifacts\\crmTools\\CrmWebResourceDeployer.exe --prefix his --src ..\\artifacts\\dist --solution PowerBIViewer -v', function (err, stdout, stderr) {
		console.log(stdout);
		console.error(stderr);
		cb(err);
	});
});

gulp.task('DEPLOY-TO-SOLUTION', ['deploy-to-solution:updatefiles', 'deploy-to-solution:updateversion'], function (cb) {
	// TODO: Create an unpacker that gets solutions from CRM, and extracts into solution src - using cmd similar to this:
	//       crmtools\SolutionPackager.exe /a:Extract /p:Both /f:"../solutionSrc" /e:Warning /allowDelete:Yes /n /loc /z:PowerBIViewer.zip

	exec('..\\artifacts\\crmTools\\SolutionPackager.exe /a:Pack /p:Both /f:"' + config.solutionSrcPath + '" /e:Warning /allowDelete:Yes /n /loc /z:"..\\artifacts\\PowerBIViewer_' + config.version.replace(/\./g, '_') + '.zip"', function (err, stdout, stderr) {
		console.log(stdout);
		console.error(stderr);
		cb(err);
	});
});

gulp.task('deploy-to-solution:updatefiles', ['DIST'], function () {
	return gulp.src(config.distPath + "**/*")
		.pipe(newer(config.solutionSrcPath + "WebResources/his_"))
		.pipe(gulp.dest(config.solutionSrcPath + "WebResources/his_"));
});

gulp.task('deploy-to-solution:updateversion', function () {
	return gulp.src(config.solutionSrcPath + "Other/Solution.xml")
		.pipe(replace(/<Version>.*<\/Version>/g, "<Version>" + config.version + "</Version>", { stripBOM: false }))
		.pipe(gulp.dest(config.solutionSrcPath + "Other/"));
});

gulp.task('CLEAN', ['clean:libraries', 'clean:scripts', 'clean:styles', 'clean:dist']);

gulp.task('clean:libraries', function () {
	return del([config.dest.libPath]);
});

gulp.task('clean:scripts', function () {
	return del(config.dest.scriptPath + '/' + config.dest.tsFilename);
});

gulp.task('clean:styles', function () {
	return del(config.dest.stylePath + '**/*.css');
});

gulp.task('clean:dist', function () {
	return del(config.distPath, { force: true });
});


gulp.task('SETUP', ['setup:typings', 'setup:crmtools']);

gulp.task('setup:typings', function () {
	return gulp.src("./typings.json")
		.pipe(typings());
});

gulp.task('setup:crmtools', function () {
	var proj = require('./project.json');
	var crmToolsDstPath = "..\\artifacts\\crmtools\\";

	var crmToolsPkgName = "Microsoft.CrmSdk.CoreTools";
	var crmToolsVersion = proj.dependencies[crmToolsPkgName];
	var crmToolsSrcPath = expandEnv("%DNX_HOME%\\packages\\") + crmToolsPkgName + "\\" + crmToolsVersion + "\\content\\bin\\coretools\\*.*";

	var crmWpfPkgName = "Microsoft.CrmSdk.XrmTooling.WpfControls"
	var crmWpfVersion = proj.dependencies[crmWpfPkgName];
	var crmWpfSrcPath = expandEnv("%DNX_HOME%\\packages\\") + crmWpfPkgName + "\\" + crmWpfVersion + "\\lib\\net45\\*.dll";

	var crmWebResourceDeployerSrcPath = "..\\tools\\CrmWebResourceDeployer\\*.*";

	return gulp.src([crmToolsSrcPath, crmWpfSrcPath, crmWebResourceDeployerSrcPath])
		.pipe(newer(crmToolsDstPath))
		.pipe(gulp.dest(crmToolsDstPath));
});


/**
 * Use with gulp-rename to make filenames compatible with requirements for Dynamics CRM web resources.
 */
function makeFilenameCrmCompatible(path) {
	/* On path:
		dirname is the relative path from the base directory set by gulp.src to the filename. •gulp.src() uses glob-stream which sets the base to the parent of the first directory glob (*, **, [], or extglob). dirname is the remaining directories or ./ if none. glob-stream versions >= 3.1.0 (used by gulp >= 3.2.2) accept a base option, which can be used to explicitly set the base.
		gulp.dest() renames the directories between process.cwd() and dirname (i.e. the base relative to CWD). Use dirname to rename the directories matched by the glob or descendents of the base of option.

		basename is the filename without the extension like path.basename(filename, path.extname(filename)).
		extname is the file extension including the '.' like path.extname(filename).
	*/
	path.basename = path.basename.replace(/-/g, function (matched) { return '_'; });
}

/**
 * Expand all environment variables in provided string (enclosed by % such as '%PATH%')
 */
function expandEnv(s) {
	var result = s;

	var reg = new RegExp("%(.+?)%");

	var match;
	while ((match = result.match(reg)) != null) {
		result = result.replace(match[0], process.env[match[1]]);
	}

	return result;
}
