// =========================================================================
// Hint Manager
// =========================================================================
define(function () {
        var JSUtils             = brackets.getModule("language/JSUtils");
        var PerfUtils           = brackets.getModule("utils/PerfUtils");
        var LanguageManager     = brackets.getModule("language/LanguageManager");
        var ProjectManager      = brackets.getModule("project/ProjectManager");
        var DocumentManager     = brackets.getModule("document/DocumentManager");
        var EditorManager       = brackets.getModule("editor/EditorManager");
        var MainViewManager     = brackets.getModule("view/MainViewManager");

        var REGEX_HASHINT_CSS_ID    = /^[\t ]*\#/;
        var REGEX_HASHINT_CSS_CLASS = /^[\t ]*\./;

        var REGEX_HTML_CLASS    = / class="([^"]+)"/ig;
        var REGEX_HTML_ID       = / id="([^"]+)"/ig;
        var REGEX_DATA          = / data-([_a-zA-Z]+[_a-zA-Z0-9-]*)/ig;
        var REGEX_CSS_CLASS     = /\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/ig;
        var REGEX_CSS_ID        = /\#(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/ig;

        var LANGUAGES           = {'javascript': ["javascript", "coffeescript", "livescript"],
                                   'css': ["css", "less", "sass", "scss"],
                                   'html': ["html","mustache"]};
        var CHECK_LANGUAGE_FILE =  {'javascript': ["html"],
                                   'css': ["html"],
                                   'html': ["html","css"]};

        var QUOTED_ATTR         = ["id","class"];

        var PREFIXES            = {};
        var SUFFIXES            = {'data-': '="++"'};

        var HTML_HINT_ATTR      = ["id","class","data-"];
        var JS_HINT_ATTR        = ["id","class","data","hasClass","removeClass","addClass"];

        var HTML_HTML_REGEX     = {'class': REGEX_HTML_CLASS, 'id': REGEX_HTML_ID, 'data-': REGEX_DATA};
        var HTML_CSS_REGEX      = {'class': REGEX_CSS_CLASS, 'id': REGEX_CSS_ID};
        var JCSS__REGEX         = {'class': REGEX_HTML_CLASS, 'id': REGEX_HTML_ID, 'data': REGEX_DATA};

        var ATTR_REDIRECT       = {'addClass': "class", 'hasClass': "class",'removeClass': "class",'removeData': 'data'};

        /**
 	 	 * reverse a string
 	 	 */
 	 	function reverse_str(s){
 	 	    return s.split("").reverse().join("");
 	 	}

        /**
         * JQueryHinter constructor
         */
        function JQueryHinter(importFuncs) {
            this.implicitChar = '';
            this.HTML_AND_CSS_LANGUAGES = LANGUAGES.html.slice();
            Array.prototype.push.apply(this.HTML_AND_CSS_LANGUAGES,LANGUAGES.css);

            this.READ_FILES = [];
            var file_types = ['html','css'];
            for (var i = 0; i < file_types.length; i++) {
                Array.prototype.push.apply(this.READ_FILES,LANGUAGES[file_types[i]]);
            }
            console.log(this.READ_FILES);
            this.REGEX_HTML = new RegExp(REGEX_HTML_ID.source+"|"+REGEX_HTML_CLASS.source+"|"+REGEX_DATA.source,'ig');
            this.REGEX_CSS  = new RegExp(REGEX_CSS_ID.source+"|"+REGEX_CSS_CLASS.source,'ig');
            this.REGEX_2_CLASS = {'HTML': ["ID","CLASS","DATA"],'CSS': ["ID","CLASS"]};
            console.log('this.REGEX_HTML: ',this.REGEX_HTML);
            console.log('this.REGEX_CSS: ',this.REGEX_CSS);
            console.log('this.REGEX_2_CLASS: ',this.REGEX_2_CLASS);
            
            
            this.match = '';
            this.allHints = {};

            this.prefixHint = '';
            this.suffixHint = '';
            this.setCursor  = false;

            this.fillCache();
        }

        /**
         * Fill all cached data (this.allHints)
         * @param {String|Boolean} fileType set false if not set otherwise use update only that fileExtensionKey
         */
        JQueryHinter.prototype.fillCache = function (fileType) {
            fileType = typeof fileType !== "undefined" ? fileType : false;

            console.log('fileType: ',fileType);
            var languageKeys = Object.keys(LANGUAGES);
            console.log('languageKeys: ',languageKeys);
            var supportedFileTypeCats;
            if (fileType === false) {
                supportedFileTypeCats = Object.keys(LANGUAGES);
            } else {
                supportedFileTypeCats = fileType;
            }
            var clInst = this;
            var supportedFileTypes;

            getAllFilesByFileTypes(this.READ_FILES)
            .done(function(files) {
                clInst.getHintsForFiles(files)
                    .done(function (defHints) {
                        var hintKeys = Object.keys(defHints);
                        var hintKey;
                        var cHints;
                        for (var i = 0; i < hintKeys.length; i++) {
                            hintKey = hintKeys[i];
                            cHints = defHints[hintKey];
                            cHints = cHints.getUnique(0);
                             // sort by match pos
                            cHints.sort(byMatch);
                            // use only the first column of hints (the name)
                            var hintsFirstColumn= [];
                            for (var i = 0; i < cHints.length; i++) {
                                hintsFirstColumn.push(cHints[i][0].substr(clInst.prefixHint.length));
                            }
                            defHints[hintKey] = hintsFirstColumn;
                        }

                        this.allHints = defHints;
                    });
            });

        }

        function byMatch(a,b) {
            var a1= a[1], b1= b[1];
            if(a1== b1) return 0;
            return a1> b1? 1: -1;
        }
                  
                  
        /**
         * return all html files in the current project
         * @returns {Deferred Array} all html file names (including the path)
         */
        function getAllFilesByFileTypes(supportedFileTypes) {
            var htmlFiles = [];
            var result = new $.Deferred();

            var timerName = PerfUtils.markStart('jQueryHinterHTML');

            function _nonBinaryFileFilter(file) {
                return supportedFileTypes.indexOf(LanguageManager.getLanguageForPath(file.fullPath)._id) >= 0;
            }

            ProjectManager.getAllFiles(_nonBinaryFileFilter)
                .done(function (files) {
                    PerfUtils.addMeasurement(timerName);
                    for(var i = 0; i < files.length; i++) {
                        // console.log(files[i]);
                    }
                    result.resolve(files);
                })
                .fail(function () {
                    PerfUtils.finalizeMeasurement(timerName);
                    result.reject();
                });

            return result.promise();
        }

         /**
          * Return all hints for the implicitChar
          * @param   {Array}         files      Brackets file array
          * @returns {DeferredArray} an array with all hints
          */
         JQueryHinter.prototype.getHintsForFiles = function (files) {
            var clInst = this;
            var result = new $.Deferred();
            var index = 0;
            var hints = {};
            // console.log('getHintsForFiles: ',files);
            getHintsForFilesRec(index)
                .done(function() {                
                    result.resolve(hints);
                }).fail(function(e) {
                    result.reject(e);
                });

            return result.promise();

            function getHintsForFilesRec(index,language) {
                var resultRec = new $.Deferred();
                clInst.getHintsForSingleFile(files[index],language)
                .done(function(hintsForSingleFile) {
                    console.log('hintsForSingleFile: ',hintsForSingleFile);
                    hints = hintExtend(hints,hintsForSingleFile);
                    console.log(hints);
                    if (index+1 < files.length) {
                        getHintsForFilesRec(index+1,hintsForSingleFile)
                            .done(function() {
                                resultRec.resolve();
                            });
                    } else {
                        resultRec.resolve();
                    }
                })
                .fail(function(e) {
                    return resultRec.reject();
                });
                return resultRec.promise();
            }
        }

         /**
         * Return all hints for the implicitChar in a single file
         * @param   {Object}        file Brackets file object
         * @returns {DeferredArray} an array with all hints
         */
        JQueryHinter.prototype.getHintsForSingleFile = function (file,language) {
            var result = new $.Deferred();
            var hRegex;
            var clInst = this;
            var hints = {};

            var fileExt = file._name.split('.').pop();
            switch (fileExt) {
                case "htm":
                    fileExt = "html";
                    break;
            }

            if (LANGUAGES.html.indexOf(fileExt) >= 0 || LANGUAGES.css.indexOf(fileExt) >= 0) {
                var go = true;
                var lang;
                if (LANGUAGES.html.indexOf(fileExt) >= 0) {
                    hRegex = this.REGEX_HTML;
                    lang = "HTML";
                } else if (LANGUAGES.css.indexOf(fileExt) >= 0) {
                    hRegex = this.REGEX_CSS;
                    lang = "CSS";
                } else {
                  result.resolve(hints);
                  go = false;
                }
              if (go) {
                DocumentManager.getDocumentText(file)
                    .done(function(doc) {
//                          console.log(hRegex);
                        var regMath = null;
                        while ((regMatch = hRegex.exec(doc)) !== null) {
                            var type;
                            var typeID;
                            for (var i = 1; i < clInst.REGEX_2_CLASS[lang].length+1; i++) {
                                if (typeof regMatch[i] !== "undefined") {
                                    type = clInst.REGEX_2_CLASS[lang][i-1]; 
                                    typeID = i;
                                    break;
                                }
                            }
//                            console.log('typeID: '+typeID);
                            var splittedRegMatches = regMatch[typeID].split(' ');
                            for (var i = 0; i < splittedRegMatches.length; i++) {
                                var splittedRegMatch = clInst.prefixHint+splittedRegMatches[i];
                                var matchPos = splittedRegMatch.indexOf(clInst.match);
                                if (matchPos >= 0) {
                                    if (type == "HTML_CLASS" || type == "CSS_CLASS") {
                                        console.log(type);   
                                        console.log(splittedRegMatch);   
                                        console.log();   
                                    }
                                    if (!hints[lang+"_"+type]) {
                                        hints[lang+"_"+type] = [];
                                    } 
                                    hints[lang+"_"+type].push([splittedRegMatch,matchPos]);
                                }
                            }
                        }

                        result.resolve(hints);
                    }).fail(function(e) {
                        result.reject(e);
                    });
                }
            } else {
                result.resolve(hints);
            }
            return result.promise();
        }

        function hintExtend(hints,arr){
            var arrKeys = Object.keys(arr);
            console.log('arrKeys: ',arrKeys);
            var arrKey;
            for (var i = 0; i < arrKeys.length; i++) {
                arrKey = arrKeys[i];   
                if (!hints[arrKey]) {
                    hints[arrKey] = [];
                }
                Array.prototype.push.apply(hints[arrKey],arr[arrKey]);
            }
            return hints;
        }
        
        Array.prototype.getUnique = function(index){
            index = typeof(index) === "undefined" ? false : index;
            var u = {}, a = [];
            for(var i = 0, l = this.length; i < l; ++i){
                if (index === false) {
                    if(u.hasOwnProperty(this[i])) {
                        continue;
                    }
                } else {
                    if(u.hasOwnProperty(this[i][index])) {
                        continue;
                    }
                }
                a.push(this[i]);
                if (index === false) {
                    u[this[i]] = 1;
                } else {
                    u[this[i][index]] = 1;
                }
            }
            return a;
        }

        /**
         * Get the current attribute (before the cursor position)
         * @returns {String} name of the attribute i.e "class" or "id"
         */
        JQueryHinter.prototype.getCurrentAttr = function () {
            var attr;
            var line = this.editor.document.getRange({line:this.pos.line,ch:0},this.pos);
            var lineRev = reverse_str(line);
            // console.log('this.language: ',this.language);
            if (LANGUAGES.html.indexOf(this.language) >= 0) {
                var match = lineRev.match(/^[^="]+"=/);
                // console.log('lineRev: ',lineRev);
                // console.log('match: ',match);
                if (match) {
                    lineRev = lineRev.substr(match[0].length);
                    this.noFixes = true;
                }

                attr = reverse_str(lineRev.split(" ")[0]);
                // console.log('attr: ', attr);
                var last2Char = attr.substr(-2);
                if (last2Char != '="' && last2Char != "='" && QUOTED_ATTR.indexOf(attr) >= 0) {
                    this.setFixes('="','"');
                } else if (QUOTED_ATTR.indexOf(attr.substr(0,attr.length-2)) >= 0) {
                    attr = attr.substr(0,attr.length-2);
                }
            } else if (LANGUAGES.js.indexOf(this.language) >= 0) {
                // console.log('lineRev: ',lineRev);
                // substr(2) because we don't want the '(
                attr = reverse_str(lineRev.split(".")[0].substr(2));
            }

            this.checkFixes(attr);

            if (attr in ATTR_REDIRECT) {
                attr = ATTR_REDIRECT[attr];
            }

            return attr;
        }

        /**
         * Check if it's possible to add fixes
         * + data-... should add an ="++" as suffix
         * @param {String} attr attribute like 'class' or 'data-'
         */
        JQueryHinter.prototype.checkFixes = function (attr) {
            if (!(attr in PREFIXES)) {
                prefix = '';
            } else {
                prefix = PREFIXES[attr];
            }
            if (!(attr in SUFFIXES)) {
                suffix = '';
            } else {
                suffix = SUFFIXES[attr];
            }
            // console.log('checkFixes for: '+attr+' => '+prefix+'! !'+suffix);

            this.setFixes(prefix,suffix);
        }

        /**
         * Add prefix and suffix
         * @param {String} prefix prefix
         * @param {String} suffix suffix
         */
        JQueryHinter.prototype.setFixes = function (prefix,suffix) {
            suffix = typeof suffix !== 'undefined' ? suffix : '';
            if (!this.noFixes) {
                this.prefixHint = prefix;
                this.suffixHint = suffix;
                if (this.suffixHint.indexOf('++') >= 0) {
                    this.setCursor = true;
                }
            }
        }


        /**
         * Checks, if it is possible to give hints inside the current docblock.
         * @param   {editor}  editor       current brackets editor
         * @param   {String}  implicitChar implicit character
         * @returns {Boolean} true for has hints otherwise false
         */
        JQueryHinter.prototype.hasHints = function (editor, implicitChar) {
            this.language   = editor.getLanguageForSelection()._id;
            this.editor     = editor;
            this.selection  = editor.getSelectedText();
            this.pos        = editor.getCursorPos();
            this.prefixHint = '';
            this.suffixHint = '';
            this.setCursor  = false;
            this.noFixes    = false;

            this.implicitChar = implicitChar;
//            // console.log('this.implicitChar: ',this.implicitChar);

            if (LANGUAGES.html.indexOf(this.language) >= 0) {
                this.fileTypes = this.HTML_AND_CSS_LANGUAGES;
                var attributes = HTML_HINT_ATTR;
                var lastChars  = attributes.map(function(ele) { return ele.substr(-1) });

                if (!this.implicitChar || lastChars.indexOf(this.implicitChar) >= 0) {
                    var attr = this.getCurrentAttr();
                    // console.log('attr: ',attr);
                    if (attributes.indexOf(attr) >= 0) {
                        this.attr = attr;
                        return true;
                    }
                }
            } else { // CSS and JS
                this.fileTypes = LANGUAGES.html;

                if (this.implicitChar == "'" || this.implicitChar == '"') {
                    var attributes = JS_HINT_ATTR;
                    var attr = this.getCurrentAttr();
                    // console.log('attr: ',attr);
                    if (attributes.indexOf(attr) >= 0) {
                        this.attr = attr;
                        return true;
                    }
                } else if (this.implicitChar == '.' || this.implicitChar == '#') {
                    // console.log('hier!!');
                    // console.log('implicitChar: '+this.implicitChar);
                    if (this.implicitChar == '.') {
                        if (LANGUAGES.css.indexOf(this.language) >= 0) {
                            var line = this.editor.document.getLine(this.pos.line);
                            // console.log('line: '+line);
                            // console.log(line.match(REGEX_HASHINT_CSS_CLASS));
                            if (!line.match(REGEX_HASHINT_CSS_CLASS)) {
                                return false;
                            }
                        }
                        this.attr = 'class';
                    } else if (this.implicitChar == '#') {
                        if (LANGUAGES.css.indexOf(this.language) >= 0) {
                            var line = this.editor.document.getLine(this.pos.line);
                            if (!line.match(REGEX_HASHINT_CSS_ID)) {
                                return false;
                            }
                        }
                        this.attr = 'id';
                    }
                    return true;
                }
            }
            return false;
        };



        /**
         * getHints for this.implicitchar
         * @returns {Object} HinterObject
         */
        JQueryHinter.prototype.getHints = function () {
            // console.log('this.pos:', this.pos);
            // console.log('this.editor.getCursorPos:', this.editor.getCursorPos());
            if (this.pos.ch > this.editor.getCursorPos().ch) {
                return false;
            }

            console.log('allHints: ',this.allHints);
            console.log('fileTypesName: ',this.fileTypes[0]);
            console.log('language: ',this.language);

            this.match = this.editor.document.getRange(this.pos, this.editor.getCursorPos());
            // console.log('getHints');
            console.time('getHints');
            var clInst = this;
            var result = $.Deferred();
            console.log('allHints for fileTypesName', clInst.allHints[clInst.fileTypes[0]]);
            var defHints = clInst.allHints[clInst.fileTypes[0]][clInst.language];
            console.log('defHints: ',defHints);
            var result = {  hints: defHints,
                            match: this.match,
                            selectInitial: true,
                            handleWideResults: false
            };

            return result;
        };

        /**
         * Inserts the hint
         */
        JQueryHinter.prototype.insertHint = function (hint) {
            // Document objects represent file contents
            var currentDoc = this.editor.document;

            // Where the range end that should be replaced
            var start = {
                line: this.pos.line,
                ch: this.pos.ch
            };
            var end = {
                line: this.pos.line,
                ch: this.pos.ch + ((this.removeSelection) ? this.selection.length : this.match.length)
            };


            // Add some text in our document
            currentDoc.replaceRange(this.prefixHint+hint+this.suffixHint, start, end);
            if (this.setCursor) {
                var line;
                var match;
                var i = 0;
                var startSetCursor, endSetCursor;
                while (i < 5) {
                    line = this.editor.document.getLine(start.line+i);
                    // console.log('line: ',line);
                    match = line.indexOf('++');
                    if (match >= 0) {
                        startSetCursor = {line: start.line+i, ch: match};
                        endSetCursor = {line: start.line+i, ch: match+2};
                        break;
                    }
                    i++;
                }
                currentDoc.replaceRange('', startSetCursor, endSetCursor);
                // Set focus on editor.
                MainViewManager.focusActivePane()
                EditorManager.getCurrentFullEditor().setCursorPos(
 	 		           startSetCursor.line,
 	 		           startSetCursor.ch);
            }

        };

        return JQueryHinter;
    });
