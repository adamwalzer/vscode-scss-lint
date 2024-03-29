// The module 'vscode' contains the VS Code extensibility API
// Import the necessary extensibility types to use in your code below
import {
  window,
  workspace,
  Disposable,
  ExtensionContext,
  StatusBarAlignment,
  StatusBarItem,
  Range,
  languages as langs,
  DiagnosticCollection,
  DiagnosticSeverity,
  Diagnostic,
} from "vscode";
import { URI } from "vscode-uri";

const exec = require("child_process").exec;
const findParentDir = require("find-parent-dir");
const glob = require("glob");
const fs = require("fs");
const path = require("path");

const CHANGE = {
  INIT: "INIT",
  SAVE: "SAVE",
  ACTIVE: "ACTIVE",
  TEXT: "TEXT",
};

let configDirIsSet = false;
let {
  errorBackgroundColor,
  warningBackgroundColor,
  languages,
  statusBarText,
  showHighlights,
  runOnTextChange,
  configDir,
} = workspace.getConfiguration("scssLint");

let errorDecorationType;
let warningDecorationType;

const updateConfig = () => {
  const newConfig: any = workspace.getConfiguration("scssLint");
  errorBackgroundColor = newConfig.errorBackgroundColor;
  warningBackgroundColor = newConfig.warningBackgroundColor;
  languages = newConfig.languages;
  statusBarText = newConfig.statusBarText;
  showHighlights = newConfig.showHighlights;
  runOnTextChange = newConfig.runOnTextChange;
  configDir = path.join(newConfig.configDir, "./");
  configDirIsSet = !!newConfig.configDir;

  errorDecorationType = window.createTextEditorDecorationType({
    backgroundColor: errorBackgroundColor,
    overviewRulerColor: errorBackgroundColor,
    overviewRulerLane: 2,
  });

  warningDecorationType = window.createTextEditorDecorationType({
    backgroundColor: warningBackgroundColor,
    overviewRulerColor: warningBackgroundColor,
    overviewRulerLane: 2,
  });
};

const isWindows = /^win/.test(process.platform);
const Q = isWindows ? "" : '"';
const CONFIG_OBJ = isWindows
  ? { env: { NL: "^& echo.", AMP: "^^^&", PIPE: "^^^|", CHEV: "^^^>" } }
  : null;

const getDocCopy = isWindows
  ? (docText) =>
      docText
        .replace(/\r/g, "")
        .replace(/\n/g, "%NL%")
        .replace(/\&/g, "%AMP%")
        .replace(/\|/g, "%PIPE%")
        .replace(/\>/g, "%CHEV%")
  : (docText) =>
      docText
        .replace(/\r/g, "")
        .replace(/\\/g, "\\\\\\")
        .replace(/\`/g, "\\`")
        .replace(/\$/g, "\\$")
        .replace(/\"/g, '\\"');

// This method is called when your extension is activated. Activation is
// controlled by the activation events defined in package.json.
export function activate(context: ExtensionContext) {
  // create a new error finder
  updateConfig();

  let errorFinder = new ErrorFinder();
  let controller = new ErrorFinderController(errorFinder);

  // Add to a list of disposables which are disposed when this extension is deactivated.
  context.subscriptions.push(controller);
  context.subscriptions.push(errorFinder);
}

class ErrorFinder {
  private _statusBarItem: StatusBarItem;

  private _diagnosticCollection: DiagnosticCollection;

  constructor() {
    this._diagnosticCollection = langs.createDiagnosticCollection();
    this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
  }

  public finderErrors(changeType) {
    // Create as needed
    if (!this._statusBarItem) return;

    // Get the current text editor
    const editor = window.activeTextEditor;
    if (!editor) {
      this._statusBarItem.hide();
      return;
    }

    updateConfig();

    let doc = editor.document;

    // Only find errors if doc languageId is in languages array
    if (!~languages.indexOf(doc.languageId)) {
      this._statusBarItem.hide();
      return;
    }

    let configFileDir = configDir || "";
    let foundFile = true;

    if (!configDirIsSet) {
      // Find and set nearest config file
      try {
        const startingDir = path.dirname(doc.fileName);
        configFileDir = path.join(
          findParentDir.sync(startingDir, ".scss-lint.yml"),
          "./"
        );
      } catch (err) {
        foundFile = false;
        console.error("error", "findParentDir");
      }
    }

    const hasConfigFileDir = configFileDir && configFileDir !== "null";

    if (hasConfigFileDir && !path.isAbsolute(configFileDir)) {
      configFileDir = path.join(workspace.rootPath || "", configFileDir);
    }

    let scssLintPath =
      hasConfigFileDir && foundFile
        ? path.join(configFileDir, ".scss-lint.yml")
        : "";

    let exclude;
    let finalNewLine = 2;
    if (scssLintPath) {
      try {
        const scssLint = fs.readFileSync(scssLintPath, "utf8") || "";
        exclude = scssLint.match(new RegExp("^exclude:(.*)", "im"));

        const finalNewLineDisabled =
          /FinalNewLine:\n*?.*?\n*?.*?enabled: false/im.test(scssLint);
        const finalNewLineError =
          /FinalNewLine:\n*?.*?\n*?.*?severity: error/im.test(scssLint);
        if (finalNewLineDisabled) {
          finalNewLine = 0;
        } else if (finalNewLineError) {
          finalNewLine = 1;
        }
      } catch (err) {
        console.error("error", `fs ${scssLintPath}`);
        scssLintPath = "";
      }
    }

    if (exclude && exclude[1]) {
      const excludePath =
        configFileDir + exclude[1].trim().replace(new RegExp("['\"]", "g"), "");
      const excludeFiles = glob.sync(excludePath, {});
      if (excludeFiles && excludeFiles.indexOf(doc.fileName) > -1) {
        return; // this file should be excluded
      }
    }

    const isText = changeType === CHANGE.TEXT;

    const docText = doc.getText();
    const docCopy = `${Q}${getDocCopy(docText)}${Q}`;
    const configCmd = scssLintPath ? `-c "${scssLintPath}" ` : "";
    const echoCmd = isText ? `echo ${docCopy}| ` : "";
    const pathCmd = isText ? "" : `${doc.fileName} `;
    const fileCmd = isText ? `--stdin-file-path="${doc.fileName}"` : "";
    const cmd = `${echoCmd}scss-lint ${pathCmd}${configCmd}${fileCmd}`;

    exec(cmd, CONFIG_OBJ, (err, stdout) => {
      const lines = stdout.toString().split("\n");

      const { exits, errors, warnings, diagnostics } = lines.reduce(
        (a, line) => {
          let info, severity;

          line = line.trim();

          if (~line.indexOf("[E]")) {
            info = line.match(/[^:]*:(\d+):(\d+) \[E\] (.*)$/);
            severity = DiagnosticSeverity.Error;
          } else if (~line.indexOf("[W]")) {
            info = line.match(/[^:]*:(\d+):(\d+) \[W\] (.*)$/);
            severity = DiagnosticSeverity.Warning;
          } else if (line) {
            info = [1, 1, 1, "Error running scss-lint: " + line];
          } else {
            return a;
          }

          const lineNum = parseInt(info[1], 10) - 1;
          const startPos = parseInt(info[2], 10) - 1;
          const message = info[3];
          const range = new Range(lineNum, startPos, lineNum + 1, 0);

          if (severity === DiagnosticSeverity.Error) {
            a.errors.push({ range, message });
            a.diagnostics.push(new Diagnostic(range, message, severity));
          } else if (severity === DiagnosticSeverity.Warning) {
            a.warnings.push({ range, message });
            a.diagnostics.push(new Diagnostic(range, message, severity));
          } else {
            severity === DiagnosticSeverity.Error;
            a.exits.push(new Diagnostic(range, message, severity));
          }

          return a;
        },
        {
          exits: [],
          errors: [],
          warnings: [],
          diagnostics: [],
        }
      );

      if (finalNewLine) {
        const hasNewLine = /\n$/.test(docText);
        if (!hasNewLine) {
          const lineNum = docText.split(/\n/).length - 1;
          const range = new Range(lineNum, 0, lineNum + 1, 0);
          const severity =
            finalNewLine === 1
              ? DiagnosticSeverity.Error
              : DiagnosticSeverity.Warning;
          diagnostics.push(
            new Diagnostic(
              range,
              "FinalNewline: Files should end with a trailing newline",
              severity
            )
          );
          const issue = {
            range,
            message: "FinalNewline: Files should end with a trailing newline",
          };
          (finalNewLine === 1 ? errors : warnings).push(issue);
        }
      }

      if (editor === window.activeTextEditor) {
        if (showHighlights) {
          editor.setDecorations(errorDecorationType, errors);
          editor.setDecorations(warningDecorationType, warnings);
        }

        const configUri = URI.file(path.join(configFileDir, ".scss-lint.yml"));
        this._diagnosticCollection.set(configUri, exits);
        this._diagnosticCollection.set(doc.uri, diagnostics);

        // Update the status bar
        this._statusBarItem.text = statusBarText
          .replaceAll("`", "")
          .replaceAll("${diagnostics.length}", diagnostics.length)
          .replaceAll("${errors.length}", errors.length)
          .replaceAll("${exits.length}", exits.length)
          .replaceAll("${warnings.length}", warnings.length);
        this._statusBarItem.show();
      }
    });
  }

  dispose() {
    this._statusBarItem.dispose();
  }
}

class ErrorFinderController {
  private _errorFinder: ErrorFinder;
  private _disposable: Disposable;

  constructor(errorFinder: ErrorFinder) {
    this._errorFinder = errorFinder;

    // subscribe to selection change and editor activation events
    let subscriptions: Disposable[] = [];
    workspace.onDidSaveTextDocument(
      this._onEvent(CHANGE.SAVE),
      this,
      subscriptions
    );
    window.onDidChangeActiveTextEditor(
      this._onEvent(CHANGE.ACTIVE),
      this,
      subscriptions
    );

    if (runOnTextChange) {
      workspace.onDidChangeTextDocument(
        this._onEvent(CHANGE.TEXT),
        this,
        subscriptions
      );
    }

    // update the error finder for the current file
    this._errorFinder.finderErrors(CHANGE.INIT);

    // create a combined disposable from both event subscriptions
    this._disposable = Disposable.from(...subscriptions);
  }

  dispose() {
    this._disposable.dispose();
  }

  private _onEvent(type) {
    return () => this._errorFinder.finderErrors(type);
  }
}
