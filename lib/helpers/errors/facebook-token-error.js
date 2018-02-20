function FacebookTokenError (message, facebookError, code = 1)
{
    this.name = "FacebookTokenError";
    this.message = message || "Invalid Token";
    this.facebookError = facebookError;
    this.code = code;
}
FacebookTokenError.prototype = Object.create (Error.prototype);
FacebookTokenError.constructor = FacebookTokenError;

exports = module.exports = FacebookTokenError;