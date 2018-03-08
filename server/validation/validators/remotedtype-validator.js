var Validator = require ('../validator');
var validators = require ('../validators');

function RemotedValidator (allowed)
{
    this.allowed = allowed;
    if (typeof allowed === 'function')
    {
        if (allowed.name === 'Remoted')
        {
            this.rule = remotedRule;
            this.typeString = 'Remoted';
        }
        else
        {
            this.rule = anyRule;
            this.typeString = allowed.name;
        }
    }
    else if (Array.isArray(allowed))
    {
        this.rule = arrayRule;
        this.typeString = allowed.map((type) => type.name).join(', ');
    }
    else
    {
        throw new Error ('Invalid allowed argument for Remoted Validator');
    }
}

Validator.inherits (RemotedValidator);

function remotedRule (val)
{
    return val === null || val.__super && val.__super === this.allowed;
}

function anyRule (val)
{
    return val === null || val.__static && val.__static === this.allowed;
}

function arrayRule (val)
{
    return val === null || val.__static && this.allowed.indexOf(val.__static) > -1;
}

RemotedValidator.prototype.errorCode = 69;
RemotedValidator.prototype.errorMessage = function (val)
{
    return "value is not of type " + this.typeString;
};

validators.remotedType = module.exports = exports = RemotedValidator;