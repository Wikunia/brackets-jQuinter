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
        var REGEX_DATA          = / data-([_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
        var REGEX_CSS_CLASS     = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
        var REGEX_CSS_ID        = /\#(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
    
        var REGEX_REVERSE_INSIDE = /^([_a-zA-Z0-9-]*[_a-zA-Z]-?)(\#|\.)?['"]/;

        var LANGUAGES           = {'javascript': ["javascript", "coffeescript", "livescript"],
                                   'css': ["css", "less", "sass", "scss"],
                                   'html': ["html","mustache"]};
        var CHECK_LANGUAGE_FILE =  {'javascript': ["html"],
                                   'css': ["html"],
                                   'html': ["html","css"]};

        var QUOTED_ATTR         = ["id","class"];

        var PREFIXES            = {'html_imp': {'id': '="','class': '="'}};
        var SUFFIXES            = {'html_imp': {'data-': '="++"'},
                                   'html_exp': {'data-': '="++"'},
                                   'css': {'id': ' {\n\t++\n}','class': ' {\n\t++\n}'},
                                   'javascript': {'on': "', "}
                                  };

        var HTML_HINT_ATTR      = ["id","class","data-"];
        var JS_HINT_ATTR        = ["id","class","data","hasClass","removeClass","addClass","on"];

        var HTML_HTML_REGEX     = {'class': REGEX_HTML_CLASS, 'id': REGEX_HTML_ID, 'data-': REGEX_DATA};
        var HTML_CSS_REGEX      = {'class': REGEX_CSS_CLASS, 'id': REGEX_CSS_ID};
        var JCSS__REGEX         = {'class': REGEX_HTML_CLASS, 'id': REGEX_HTML_ID, 'data': REGEX_DATA};

        var ATTR_REDIRECT       = {'addClass': "class", 'hasClass': "class",'removeClass': "class",'removeData': 'data'};
    
        var SPECIAL_ATTR        = {'javascript': {'on': ['change','click','dblclick','focus','focusin','focusout','hover','keydown',
                                                         'keypress','keyup','mousedown','mouseenter','mouseleave','mousemove','mouseover',
                                                         'mouseout','mouseup','resize','scroll','select','submit']}};

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
            this.REGEX_HTML = new RegExp(REGEX_HTML_ID.source+"|"+REGEX_HTML_CLASS.source+"|"+REGEX_DATA.source,'ig');
            this.REGEX_CSS  = new RegExp(REGEX_CSS_ID.source+"|"+REGEX_CSS_CLASS.source,'ig');
            this.REGEX_2_CLASS = {'HTML': ["ID","CLASS","DATA"],'CSS': ["ID","CLASS"]};
            
            this.reverseLanguage = {};
            for(var key in LANGUAGES) {
                for (var i = 0; i < LANGUAGES[key].length; i++) {
                    this.reverseLanguage[LANGUAGES[key][i]] = key;
                }
            }
            
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

            var languageKeys = Object.keys(LANGUAGES);
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
                        clInst.updateHints(defHints);
                    });
            });

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
            
            // no files at all
            if (files.length == 0) {
                result.resolve(hints);   
                return result.promise();
            }
             
            getHintsForFilesRec(index)
                .done(function() {                
                    result.resolve(hints);
                }).fail(function(e) {
                    result.reject(e);
                });

            return result.promise();

            function getHintsForFilesRec(index) {
                var resultRec = new $.Deferred();
                clInst.getHintsForSingleFile(files[index])
                .done(function(hintsForSingleFile) {

                    hints = hintExtend(hints,hintsForSingleFile);

                    if (index+1 < files.length) {
                        getHintsForFilesRec(index+1)
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
        JQueryHinter.prototype.getHintsForSingleFile = function (file) {
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

                            var splittedRegMatches = regMatch[typeID].split(' ');
                            for (var i = 0; i < splittedRegMatches.length; i++) {
                                var splittedRegMatch = clInst.prefixHint+splittedRegMatches[i];
                                if (!hints[type]) {
                                    hints[type] = [];
                                } 
                                hints[type].push(splittedRegMatch);
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

        /**
         * extend the hints using arr
         * @param   {Object} hints the old hints
         * @param   {Object} arr   new hints that will extend the old ones
         * @returns {Object} the combined hints
         */
        function hintExtend(hints,arr){
            var arrKeys = Object.keys(arr);

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
        
        /**
         * Get unique elements in an array using the column index
         * @param   {Number} [index=false] index of the column that should be unique (not set => unique in total)
         * @returns {Array}  array where the elements in the defined index are unique
         */
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
         * update the hints using a single file
         * @param {Object} file Brackets file object
         */
        JQueryHinter.prototype.updateFile = function (file) {
            var clInst = this;
            var fileExt = file._name.split('.').pop();
            switch (fileExt) {
                case "htm":
                    fileExt = "html";
                    break;
            }
            
            if (this.READ_FILES.indexOf(fileExt) >= 0) {
//                console.time('updateFile');
                clInst.getHintsForSingleFile(file)
                .done(function(hints) {
                    hints = hintExtend(clInst.allHints,hints);
                    clInst.updateHints(hints);
//                    console.log('updated: ',clInst.allHints);
//                    console.timeEnd('updateFile');
                });
            }
        }
        
        /**
         * Update the hints (this.allHints) using the new hints hints
         * @param {Array} hints new hints
         */
        JQueryHinter.prototype.updateHints = function (hints) {
            var clInst = this;
            var hintKeys = Object.keys(hints);
            var hintKey;
            var cHints;
            for (var i = 0; i < hintKeys.length; i++) {
                hintKey = hintKeys[i];
                cHints = hints[hintKey];
                cHints = cHints.getUnique();
                hints[hintKey] = cHints;
            }

            clInst.allHints = hints;
        }
        
        /**
         * Get the current attribute (before the cursor position)
         * @returns {String} name of the attribute i.e "class" or "id"
         */
        JQueryHinter.prototype.getCurrentAttr = function () {
            var attr;
            var line = this.editor.document.getRange({line:this.pos.line,ch:0},this.pos);
            var lineRevInitial = reverse_str(line);
            var lineRev = lineRevInitial;
            
        
            if (LANGUAGES.html.indexOf(this.language) >= 0) {
                var match = lineRev.match(/^[^="]+"=/);
                
                if (match) {
                    lineRev = lineRev.substr(match[0].length);
                    this.noFixes = true;
                }

                attr = reverse_str(lineRev.split(" ")[0]);
                
                var last2Char = attr.substr(-2);
                if (last2Char != '="' && last2Char != "='" && QUOTED_ATTR.indexOf(attr) >= 0) {
                    this.setFixes('="','"');
                } else if (QUOTED_ATTR.indexOf(attr.substr(0,attr.length-2)) >= 0) {
                    attr = attr.substr(0,attr.length-2);
                }
            } else if (LANGUAGES.javascript.indexOf(this.language) >= 0) {
                // substr(2) because we don't want the '(
                attr = reverse_str(lineRev.split(".")[0].substr(2));
            }

            // if the implicitChar is set the first part of lineRev must be the attr (in all HTML files)
            if (this.implicitChar && LANGUAGES.html.indexOf(this.language) >= 0) {
                if (reverse_str(lineRevInitial.substr(0,attr.length)) != attr) {
                    return false;   
                }
            }
            
            if (attr in ATTR_REDIRECT) {
                attr = ATTR_REDIRECT[attr];
            }
            this.checkFixes(attr);
            return attr;
        }

        
        /**
         * Check if it's possible to add fixes
         * + data-... should add an ="++" as suffix
         * @param {String} attr attribute like 'class' or 'data-'
         */
        JQueryHinter.prototype.checkFixes = function (attr, line) {
            var prefix, suffix;
            
            var langReversed = this.reverseLanguage[this.language];
            // html has two different suffix systems one for implicitChar and one for explicit
            if (langReversed == "html") {
                if (!this.implicitChar) {
                    langReversed += "_exp";   
                } else {
                    langReversed += "_imp";   
                }
            }
            
            
            if (!(langReversed in PREFIXES) || !(attr in PREFIXES[langReversed])) {
                prefix = '';
            } else {
                prefix = PREFIXES[langReversed][attr];
            }
            if (!(langReversed in SUFFIXES) || !(attr in SUFFIXES[langReversed])) {
                suffix = '';
            } else {
                suffix = SUFFIXES[langReversed][attr];
            }

            // check if suffix must be set
            if (suffix.indexOf('{') >= 0 && line.indexOf('{') >= 0) {
                suffix = '';   
            }
            
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
            
            
            // HTML Language
            if (LANGUAGES.html.indexOf(this.language) >= 0) {
                this.fileTypes = this.HTML_AND_CSS_LANGUAGES;
                var attributes = HTML_HINT_ATTR;
                var lastChars  = attributes.map(function(ele) { return ele.substr(-1) });

                if (!this.implicitChar || lastChars.indexOf(this.implicitChar) >= 0) {
                    var attr = this.getCurrentAttr();
                    if (!attr) { return false; }
                    
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
                    if (!attr) { return false; }
                    
                    if (attributes.indexOf(attr) >= 0) {
                        this.attr = attr;
                        return true;
                    }
                } else if (this.implicitChar == '.' || this.implicitChar == '#') {
                    var line = this.editor.document.getRange({line:this.pos.line,ch:0},this.pos);
                    if (this.implicitChar == '.') {
                        if (LANGUAGES.css.indexOf(this.language) >= 0) {
                            var line = this.editor.document.getLine(this.pos.line);
                            if (!line.match(REGEX_HASHINT_CSS_CLASS)) {
                                return false;
                            }
                        } else { // js
                            var charBefore = this.editor.document.getRange({line:this.pos.line,ch:this.pos.ch-2},this.pos).charAt(0);
                            if (charBefore !== '"' && charBefore !== "'") {
                                return false;
                            }
                        }
                        this.attr = 'class';
                        this.checkFixes(this.attr, line);
                    } else if (this.implicitChar == '#') {
                        if (LANGUAGES.css.indexOf(this.language) >= 0) {
                            var line = this.editor.document.getLine(this.pos.line);
                            if (!line.match(REGEX_HASHINT_CSS_ID)) {
                                return false;
                            }
                        } else { // js
                            var charBefore = this.editor.document.getRange({line:this.pos.line,ch:this.pos.ch-2},this.pos).charAt(0);
                            if (charBefore !== '"' && charBefore !== "'") {
                                return false;
                            }
                        }
                        this.attr = 'id';
                        this.checkFixes(this.attr, line);
                    }
                    return true;
                } else { // maybe after a typo directly inside i.e a class name
                    var line = this.editor.document.getRange({line:this.pos.line,ch:0},this.pos);
                    var lineRev = reverse_str(line);
                    var match = lineRev.match(REGEX_REVERSE_INSIDE);
                    if (match) {
                        this.pos.ch -= match[0].length-2; // one char for '.' or '#' and one for ' or "
                        if (match[2] == '.') {
                            this.attr = 'class';
                        } else if(match[2] == '#') {
                            this.attr = 'id';  
                        } else if (!(match[2])) {
                            // maybe something else like data
                            this.pos.ch -= 1; // there is neither a '#' nor a '.'
                            var attributes = JS_HINT_ATTR;
                            var attr = this.getCurrentAttr();
                            if (!attr) { return false; }
                            if (attributes.indexOf(attr) >= 0) {
                                this.attr = attr;
                            } else {
                                return false;   
                            }
                        }
                        this.checkFixes(this.attr);   
                        
                        return true;
                    }
                    
                }
                    
            }
            return false;
        };



        /**
         * getHints for this.implicitchar
         * @returns {Object} HinterObject
         */
        JQueryHinter.prototype.getHints = function () {
            
            
            if (this.pos.ch > this.editor.getCursorPos().ch) {
                return false;
            }
            var clInst = this;
            var result = $.Deferred();
            var defHints; 
            this.match = this.editor.document.getRange(this.pos, this.editor.getCursorPos());
            
            // check if attr is inside special attributes like 'on'
            var revLang = this.reverseLanguage[this.language];
            if (revLang in SPECIAL_ATTR && this.attr in SPECIAL_ATTR[revLang]) {
                // attr is a special attr
                defHints = SPECIAL_ATTR[revLang][this.attr];    
            } else { // normal 
                var allHintsKey = this.attr.toUpperCase();
                if (allHintsKey == "DATA-") {
                    allHintsKey = "DATA";  
                }

                defHints = clInst.allHints[allHintsKey];                
            }
            
            
            /*
            console.log('this.match: ',this.match);
            console.log('allHints: ',this.allHints);
            console.log('fileTypesName: ',this.fileTypes[0]);
            console.log('language: ',this.language);
            console.log('attr: ',this.attr);
            console.log('prefixHint: ',this.prefixHint);
            console.log('suffixHint: ',this.suffixHint);
            */

            defHints = this.getMatchingHints(defHints);
            if (!defHints || defHints.length == 0) {
                return false;   
            }
           
            var result = {  hints: defHints,
                            match: this.match,
                            selectInitial: true,
                            handleWideResults: false
            };
            return result;
        };
    
        
        /**
         * Sort out hints that don't match this.match
         * @param {Array} hints all hints
         */
        JQueryHinter.prototype.getMatchingHints = function (hints) {
            if (this.match == '') {
                return hints;   
            }
            var cHint;
            var returnHints = [];
            var matchPos;
            var matchWOPrefix = this.removePrefix();
            for (var i = 0; i < hints.length; i++) {
                cHint = hints[i];
                
                if ((matchPos = cHint.toLowerCase().indexOf(matchWOPrefix.toLowerCase())) >= 0) {
                    var sameCases = this.nrOfSameCases(matchPos,cHint,matchWOPrefix);
                    returnHints.push([cHint,matchPos,sameCases]);
//                    returnHints.push([cHint,-sameCases,-matchPos]);
                }
            }
            returnHints.sort(this.orderHints());
            return returnHints.getCol(0);
        }
    
        JQueryHinter.prototype.nrOfSameCases = function(pos,hint,match) {
            var hint = hint.substr(pos);
            var c = 0;
            for (var i = 0; i < match.length; i++) {
                if (match.charAt(i) === hint.charAt(i)) {
                    c++;   
                }
            }
            return c;
        }
        
        /**
         * remove the prefix in this.match
         * @returns {String} this.match without this.prefixHint
         */
        JQueryHinter.prototype.removePrefix = function () {
            return this.match.substr(this.prefixHint.length);
        }
        
        /**
         * Sorting function 
         * sort by match (second column) and then by number of correct cases (lower,upper) (third column)
         * @param   {Array}  a array of the first comparable
         * @param   {Array}  b array of the second comparable
         * @returns {Number} 0 if equal 1 if first is greater, else: -1
         */
        JQueryHinter.prototype.orderHints = function() {
            return function(a,b) {
                if(a[1]== b[1]) {
                    if (a[2] > b[2]) {
                        return -1;   
                    } else {
                        return 1;   
                    }
                }
                return a[1] > b[1] ? 1: -1;
            }
        }
        
        /**
         * Return all elements in a column
         * @param   {Number} col number of the column
         * @returns {Array}  all elements in that column as array
         */
        Array.prototype.getCol = function (col){
           var column = [];
           for(var i=0; i< this.length; i++){
              column.push(this[i][col]);
           }
           return column;
        }
        
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
                while (i < this.suffixHint.length) {
                    line = this.editor.document.getLine(start.line+i);
                    
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
