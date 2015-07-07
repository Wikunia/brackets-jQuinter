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
        var REGEX_CSS_CLASS     = /\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/ig;
        var REGEX_CSS_ID        = /\#(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/ig;
        var REGEX_DATA          = / data-([_a-zA-Z]+[_a-zA-Z0-9-]*)/ig;
    
        var JS_LANGUAGES        = ["javascript", "coffeescript", "livescript"];
        var CSS_LANGUAGES       = ["css", "less", "sass", "scss"];
        var HTML_LANGUAGES      = ["html","mustache"];
    
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
            this.HTNL_AND_CSS_LANGUAGES = HTML_LANGUAGES.slice();
            Array.prototype.push.apply(this.HTNL_AND_CSS_LANGUAGES,CSS_LANGUAGES);
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
            var hints = [];
            // console.log('getHintsForFiles: ',files);
            getHintsForFilesRec(index)
                .done(function() {
                    // console.log('hints:', hints);
                    hints = hints.getUnique(0);
                    hints.sort(function(a, b){
                        var a1= a[1], b1= b[1];
                        if(a1== b1) return 0;
                        return a1> b1? 1: -1;
                    });
                    // console.log('getHintsForSingleFile hints:', hints);
                
                    // use only the first column of hints (the name)
                    var hintsFirstColumn= [];
                    for (var i = 0; i < hints.length; i++) {
                        hintsFirstColumn.push(hints[i][0].substr(clInst.prefixHint.length));
                    }
                    result.resolve(hintsFirstColumn);
                }).fail(function(e) {
                    result.reject(e);
                });
            
            return result.promise(); 
             
            function getHintsForFilesRec(index) { 
                var resultRec = new $.Deferred();    
                clInst.getHintsForSingleFile(files[index])
                .done(function(hintsForSingleFile) {
                    // console.log('hintsForSingleFile:', hintsForSingleFile);
                    // extend
                    Array.prototype.push.apply(hints,hintsForSingleFile);
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
            // console.log('hintsForSingleFile FilePath: ',file._path);
            var fileExt = file._name.split('.').pop();
            switch (fileExt) {
                case "htm":
                    fileExt = "html";
                    break   
            }
            
        
            var result = new $.Deferred(); 
            var hRegex;
            var clInst = this;
            var hints = [];
            // console.log('this.match:', clInst.match);
            // console.log('this.language:', clInst.language);
            // console.log('fileExt:', fileExt);
            if (HTML_LANGUAGES.indexOf(clInst.language) >= 0) {  
                // console.log('html languages: ', HTML_LANGUAGES);
                if (HTML_LANGUAGES.indexOf(fileExt) >= 0) {   
                    // console.log('fileext is html');
                    if (clInst.attr in HTML_HTML_REGEX) {
                        hRegex = HTML_HTML_REGEX[clInst.attr];
                    }          
                } else if (CSS_LANGUAGES.indexOf(fileExt) >= 0) {   
                    // console.log('CSS');
                    if (clInst.attr in HTML_CSS_REGEX) {
                        // console.log('CSS 2');
                        hRegex = HTML_CSS_REGEX[clInst.attr];
                    }
                }
            } else { 
                // set brackets and the cursor inside the brackets
                if (CSS_LANGUAGES.indexOf(clInst.language) >= 0) {
                    // setCursor will remove ++ and set the cursor at that position
                    this.setFixes('',' {\n\t++\n}');
                }                    
                // console.log('clInst.attr: ',clInst.attr);
                if (clInst.attr in JCSS__REGEX) {
                    hRegex = JCSS__REGEX[clInst.attr];
                }                
            }
            if (!hRegex) {
                result.resolve([]);   
            } else { 
                DocumentManager.getDocumentText(file)
                    .done(function(doc) {
                        var regMatch;
                        // console.log('hRegex: ',hRegex);
                        while ((regMatch = hRegex.exec(doc)) !== null) {
                            var splittedRegMatches = regMatch[1].split(' ');
                            for (var i = 0; i < splittedRegMatches.length; i++) {
                                var splittedRegMatch = clInst.prefixHint+splittedRegMatches[i];
                                var matchPos = splittedRegMatch.indexOf(clInst.match);
//                                // console.log('splittedRegMatch: ',splittedRegMatch);
//                                // console.log('matchPos: ',matchPos);
                                if (matchPos >= 0) {
                                    hints.push([splittedRegMatch,matchPos]);
                                }
                            }
                        }

                        result.resolve(hints);
                    }).fail(function(e) {
                        result.reject(e);
                    });
            }
            
            return result.promise();    
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
            if (HTML_LANGUAGES.indexOf(this.language) >= 0) {    
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
            } else if (JS_LANGUAGES.indexOf(this.language) >= 0) {    
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
            
            if (HTML_LANGUAGES.indexOf(this.language) >= 0) {
                this.fileTypes = this.HTNL_AND_CSS_LANGUAGES;
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
                this.fileTypes = HTML_LANGUAGES;
                
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
                        if (CSS_LANGUAGES.indexOf(this.language) >= 0) {
                            var line = this.editor.document.getLine(this.pos.line); 
                            // console.log('line: '+line);
                            // console.log(line.match(REGEX_HASHINT_CSS_CLASS));
                            if (!line.match(REGEX_HASHINT_CSS_CLASS)) {
                                return false;
                            }                                
                        }
                        this.attr = 'class';   
                    } else if (this.implicitChar == '#') {
                        if (CSS_LANGUAGES.indexOf(this.language) >= 0) {
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
            
            this.match = this.editor.document.getRange(this.pos, this.editor.getCursorPos());
            // console.log('getHints');
            var clInst = this;
            var result = $.Deferred();
            getAllFilesByFileTypes(clInst.fileTypes)
                .done(function(files) {
                    clInst.getHintsForFiles(files)
                        .done(function (defHints) {
                            // console.log('defHints:', defHints);
                            result.resolve({
                                hints: defHints,
                                match: this.match,
                                selectInitial: true,
                                handleWideResults: false
                            });
                        });
                }); 
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
