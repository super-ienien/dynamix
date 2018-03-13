var Validator = require ('../validator');
var validators = require ('../validators');

function PatternValidator (pattern)
{
	this.pattern = pattern;
}

Validator.inherits (PatternValidator);

PatternValidator.prototype.rule = function (val)
{
	return this.pattern.test (val);
}

PatternValidator.prototype.errorCode = 11;
PatternValidator.prototype.errorMessage = function (val)
{
	val+" doesn't match pattern : '"+this.pattern+"'";
}

PatternValidator.restricTo = ['string'];

validators.pattern = module.exports = exports = PatternValidator;