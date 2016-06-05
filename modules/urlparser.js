var request = require('request');
var url = require('url');
var cheerio = require('cheerio');

var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();

// Regular expressions to extract URL's
var extractUrlRE = /(^|[ \t\r\n])((https?):(([A-Za-z0-9$_.+!*(),;/?:@&~=-])|%[A-Fa-f0-9]{2}){2,}(#([a-zA-Z0-9][a-zA-Z0-9$_.+!*(),;/?:@&~=%-]*))?([A-Za-z0-9$_+!*();/?:~-]))/g;

// Maximum length of a title before we cut if off and append ellipses
var maxTitleLength = 256;

/**
 * URL Module
 * @constructor
 */
var UrlParser = function() {};

var moduleName = "UrlParser/1.0";
UrlParser.prototype.moduleName = moduleName;

/**
 * Called when ExAstris loads this module.
 *
 * @param exastris  ExAstris instance
 * @param log       Logger instance
 * @param db        DB Instance
 * @param config    The full config file
 */
UrlParser.prototype.onLoad = function (exastris, log, db, config) {
    var self = this;

    self.exastris = exastris;
    self.log = log;
    self.db = db;
    self.config = config;

    self.log.info(moduleName + " Instance Initialized");

    self.registerCallbacks();
};

/**
 * Register any callbacks to ExAstris
 */
UrlParser.prototype.registerCallbacks = function() {
    var self = this;

    self.exastris.addGeneric("Detect and output website titles.", self.handleUrl.bind(self));
};

/**
 * Handler for generic messages that will parse out all URL's, search the URL for a title, and output the title if it exists.
 *
 * @param server        {Server} document passed from ExAstris
 * @param currentUser   {User} document for matching Source
 * @param source        {String} nickname
 * @param destination   {String} nickname or channel name
 * @param text          {String} full received message text
 * @returns             {boolean} True if all URL's were parsed, false if no URLs were parsed.
 */
UrlParser.prototype.handleUrl = function(command) {
    var self = this;

    // Match all of the URL's in the input string
    var matchedURLs = command.text.match(extractUrlRE);

    if (matchedURLs && matchedURLs.length > 0) {
        self.log.trace("Found " + matchedURLs.length + " URL(s)...");

        for (var i = 0, len = matchedURLs.length; i < len; i++) {
            var rawURL = matchedURLs[i];

            var parsedURL = url.parse(rawURL);

            if (!parsedURL) {
                self.log.debug("Unable to parse URL '" + rawURL + "'");
                continue;
            }

            // TODO: Exclude twitter and reddit url's that have valid tweet ID's and reddit ID's that we can show more details for
            // TODO: Or, implement getModule(reddit) getModule(twitter) and directly access modules to obtain detailed info

            // Send the HTTP request for the url
            request.get(parsedURL.href, self.handleHttpResponse.bind(self, command, parsedURL));
        }

        return true;
    }

    return false;
};

/**
 * Decodes HTML entities, replaces white spaces and line breaks with spaces, removes double spaces.
 *
 * @param title         {string} title to be cleaned
 * @returns             {string} cleaned title
 */
UrlParser.prototype.cleanTitle = function (title) {
    title = entities.decode(title);

    // Now remove all line breaks and replace them with a space...
    title = title.replace(/(\r\n|\n|\r)/gm, " ");

    // Let's also remove any tabs and replace them with a space...
    title = title.replace(/\t/gm, " ");

    // Finally, remove any double spaces that may have piled up!
    title = title.replace(/\s+/g, " ");

    return title;
};

/**
 * Handle HTTP Responses
 */
UrlParser.prototype.handleHttpResponse = function(command, parsedURL, error, response, body) {
    var self = this;

    if (error) {
        return self.log.error("HTTP Request Error", {url: parsedURL.href, error: error});
    }

    if (response.statusCode !== 200) {
        return self.log.debug("HTTP Response Invalid Status Code", {url: parsedURL.href, statusCode: response.statusCode});
    }

    // If the content type isn't HTML, redirect to a secondary handler for potential content type redirects.
    if (response.headers['content-type'].indexOf('text/html') === -1) {
        return self.handleContentTypes(command, parsedURL, error, response, body);
    }

    // Use cheerio to properly parse the HTML body so we can extract useful command
    var $ = cheerio.load(body);

    // Extract the basic title tag
    var rawTitle = $('title').text();
    if (rawTitle) {
        // Clean the title
        var title = self.cleanTitle(rawTitle);

        // Trim the title if it is too long
        if (title.length > maxTitleLength) {
            title = title.substr(0, maxTitleLength).concat('...');
        }

        self.exastris.reply(command, title);

        return self.log.trace("Title Found" + {url: parsedURL, title: title});
    }
};

UrlParser.prototype.handleContentTypes = function(command, parsedURL, error, response, body) {
    var self = this;

    // If the URL is an imgur image, we can redirect to the gallery page
    if (parsedURL.hostname.indexOf('imgur.com') > -1) {
        // Matches '/imgurhash.ext', returning "imgurhash"
        var parseImgurUrl = parsedURL.path.match(/(\/)([A-Za-z0-9]+)(.)([A-Za-z]+)/i);

        if (parseImgurUrl && parseImgurUrl[2]) {

            // Reconstruct the imgur.com url
            var imgurUrl = url.parse(parsedURL.protocol.concat('//', parsedURL.host, '/', parseImgurUrl[2]));

            // If the url is properly formed, perform another request to pull the proper title
            if (imgurUrl) {
                return request.get(imgurUrl.href, self.handleHttpResponse.bind(self, command, imgurUrl));
            }
        }
    }

    return self.log.debug("HTTP Response Invalid Mime Type", {url: parsedURL.href, 'content-type': response.headers['content-type']});
};

module.exports = new UrlParser();