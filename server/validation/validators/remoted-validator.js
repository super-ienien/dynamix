const Validator = require ('../validator');
const validators = require ('../validators');

function RemotedValidator (type) {
	this.multiType = Array.isArray(type);
	this.type = type;
}

Validator.inherits (RemotedValidator);

RemotedValidator.prototype.rule = function (val)
{
	if (this.multiType)
	{
		return this.type.indexOf(val.split('.')[0]) > -1;
	}
	else
	{
        return val.split('.')[0] === this.type;
	}
};

RemotedValidator.prototype.errorCode = 15;
RemotedValidator.prototype.errorMessage = 'Wrong remoted type';

validators.required = module.exports = exports = new RemotedValidator();