define(
[
	'angular'
,	'tt/core/util'
,   'tt/core/eventemitter'
]
,
function(angular)
{
	return angular.module ('tt.core.remote', 
	[
		'tt.core.util'
	,   'tt.core.eventemitter'
	]);
});