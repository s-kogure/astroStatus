const gulp = require('gulp');
const sassCompiler = require('gulp-sass')(require('sass'));
const plumber = require('gulp-plumber');
const cleanCSS = require('gulp-clean-css');
const rename = require('gulp-rename');

const paths = {
  scssEntry: 'public/src/scss/style.scss',
  scssWatch: 'public/src/scss/**/*.scss',
  cssDest: 'public/src/css',
};

function styles() {
  return gulp
    .src(paths.scssEntry, { sourcemaps: true })
    .pipe(plumber())
    .pipe(sassCompiler.sync({ outputStyle: 'expanded' }).on('error', sassCompiler.logError))
    .pipe(gulp.dest(paths.cssDest, { sourcemaps: '.' }));
}

function stylesMin() {
  return gulp
    .src(`${paths.cssDest}/style.css`, { sourcemaps: true })
    .pipe(plumber())
    .pipe(cleanCSS())
    .pipe(rename({ suffix: '.min' }))
    .pipe(gulp.dest(paths.cssDest, { sourcemaps: '.' }));
}

function watchFiles() {
  gulp.watch(paths.scssWatch, build);
}

const build = gulp.series(styles, stylesMin);

exports.sass = styles;
exports.build = build;
exports.watch = gulp.series(styles, watchFiles);
exports.default = exports.watch;
