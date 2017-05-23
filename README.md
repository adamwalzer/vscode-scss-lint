# scss-lint README

This is a small scss-lint extension for vscode.

![Alt text](images/demo.gif?raw=true "Demo Gif")

## Features

This extention runs scss-lint in bash and displays the errors found by highlighting the errors in your scss files upon saving of that file.

## Requirements

This extention is dependant on the ruby gem scss-lint. It has only been tested with version .0.49.0 of scss_lint so we therefore suggest you run the following in your terminal:
`gem install scss_lint -v 0.49.0`

## Extension Settings

This extension runs scss-lint which uses your .scss-lint.yml file. Simply install the extension, and it works.
scssLint.errorBackgroundColor set the error background color and defaults to "rgba(200, 0, 0, .8)".
scssLint.warningBackgroundColor set the warning background color and defaults to "rgba(200, 120, 0, .8)".

## Known Issues

Known issues are tracked on github. Feel free to post them there or resolve some of the issues you see.

## Release Notes

### See the [CHANGELOG](CHANGELOG.md) for notes on each release.

-----------------------------------------------------------------------------------------------------------

## Thanks

We must thank [sass](http://sass-lang.com), [scss-lint](https://github.com/brigade/scss-lint), and [vscode-wordcount](https://github.com/Microsoft/vscode-wordcount) for the help they provided in making this extension.

Also, thank you to [@youdame](https://github.com/yoodame) for his PR making this extension work even when the .scss-lint.yml isn't in the root directory of the project.

**Enjoy!**
