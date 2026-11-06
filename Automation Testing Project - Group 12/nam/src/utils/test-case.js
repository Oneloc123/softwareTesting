"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.test = exports.expect = void 0;
exports.caseTitle = caseTitle;
exports.blockedIf = blockedIf;
const auth_fixture_js_1 = require("../fixtures/auth.fixture.js");
function caseTitle(id, title, options) {
    const tags = [options.write ? '@write' : '@read', options.smoke ? '@smoke' : ''].filter(Boolean).join(' ');
    return `${id} - ${title} ${tags}`;
}
function blockedIf(condition, reason) { auth_fixture_js_1.test.skip(condition, `Blocked: ${reason}`); }
var auth_fixture_js_2 = require("../fixtures/auth.fixture.js");
Object.defineProperty(exports, "expect", { enumerable: true, get: function () { return auth_fixture_js_2.expect; } });
Object.defineProperty(exports, "test", { enumerable: true, get: function () { return auth_fixture_js_2.test; } });
