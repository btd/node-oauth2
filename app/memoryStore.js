
/*
    Internal object should contain at least 3 fields: client_id, username, value and optionally expires_in, redirect_uri
 */

var Store = function() {
    this._internalStore = {};
    this._cache = {};
};

Store.prototype = Object.create({
    put: function(objKey, callback) {
        this._internalStore[objKey.client_id] = this._internalStore[objKey.client_id] || {};
        this._internalStore[objKey.client_id][objKey.username] = objKey;
        this._cache[objKey.value] = objKey;
        callback(false);
    },
    remove: function(objKey, callback) {
        if(this._internalStore[objKey.client_id]) {
            delete this._internalStore[objKey.client_id][objKey.username];
        }
        delete this._cache[objKey.value];
        callback && callback(false);
    },
    get: function(objKey, callback) {
        callback(false, (objKey.client_id && this._internalStore[objKey.client_id] && this._internalStore[objKey.client_id][objKey.username]) || this._cache[objKey]);
    }
});

module.exports = Store;

