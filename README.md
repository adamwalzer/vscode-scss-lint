# scss-lint README

This is a small scss-lint extension for vscode.

## Features

This extention runs scss-lint in bash and displays the errors found by highlighting the errors in your scss files upon saving of that file.

## Requirements

This extention is dependant on the ruby gem scss-lint. It has only been tested with version .0.49.0 of scss_lint so we therefore suggest you run the following in your terminal:
`gem install scss_lint -v 0.49.0`

## Extension Settings

This extension does not currently take any settings. Simply install it, and it works.

## Known Issues

At this time there are no known issues with this extension as it has been tested very limitedly.

## Release Notes

### 0.0.5

Improving efficiency and adding overview ruler color.

### 0.0.4

Adding the icon and package.json update.

### 0.0.3

This release uses a regex to map the error message to the output.

### 0.0.2

This release fixes an issue with a potential race condition while updating the status bar.

### 0.0.1

This is the initial release of this extension.

-----------------------------------------------------------------------------------------------------------

## Thanks

We must thank sass (http://sass-lang.com), scss-lint (https://github.com/brigade/scss-lint), and vscode-wordcount (https://github.com/Microsoft/vscode-wordcount) for the help they provided in making this extension.

**Enjoy!**
