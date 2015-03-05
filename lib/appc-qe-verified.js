var async = require('async');
var jiraApi = require('jira').JiraApi;
var moment = require('moment');
var sprintf = require('sprintf-js').sprintf;
var Table = require('cli-table');
var config = require('../config.js');

var qe = config.users;
var start = new moment(config.start);
var end = new moment(config.end);
var jira = new jiraApi('https', config.host, config.port, config.user, config.password, '2', true);
var output = {};

/**
 * Create a paramaterized search across an array of JIRA users
 * @param {string} search - search string with %1, %2 and %3 placeholders for the user, the start date and the end date, respectively}
 * @param {Array} qe - array of user names
 * @param {Object} start - moment.js date
 * @param {Object} end - moment.js date
 * @return {string}
 */
function createSearch(search, qe, start, end) {
	var searchArray = qe.map(function(tester) { return sprintf(search, tester, start.format('YYYY/MM/DD'), end.format('YYYY/MM/DD')); });
	return searchArray.join(' OR ');
}

/**
 * Add a detail object
 * @param {string}
 * @param {Object}
 */
function createDetail(action, key, points, summary, changelog) {
	var pointVal = (points) ? points : 0;
	return {'action': action, 'key': key, 'points': pointVal, 'summary': summary, 'changelog': changelog};
}

/**
 * Process the JIRA ticket data
 * @param {string} type - Type of processing
 * @param {JSON} data - JSON object of ticket data
 * @param {Function} filter - Filter function for picking ticket data
 */
function processData(type, data, filter) {
	process.stdout.write(sprintf('Processing %d %s tickets', data.issues.length, type));
	for (var i = data.issues.length - 1; i >= 0; i--) {
		var issue = data.issues[i];
		filter(issue);
		process.stdout.write('.');
	}
	console.log();
}

/**
 * Process a single issue object to record who filed it
 * @param  {Object} issue - An issue object
 */
function processFiled(issue) {
	var author = issue.fields.creator.name;
	//jscs:disable requireCamelCaseOrUpperCaseIdentifiers
	output[author].detail.push(createDetail('filed', issue.key, issue.fields.customfield_10003, issue.fields.summary, issue.changelog));
	if (issue.key.indexOf('QE') === 0) {
		output[author].filedQe++;
	} else if (issue.key.indexOf('PROC') === 0) {
		output[author].filedProc++;
	} else {
		output[author].filedOther++;
	}
}

/**
 * Process a single issue object to record who commented on it
 * @param  {Object} issue - An issue object
 */
function processCommented(issue) {
	var author = issue.fields.creator.name;
	if (qe.indexOf(author) >= 0) {
		//jscs:disable requireCamelCaseOrUpperCaseIdentifiers
		output[author].detail.push(createDetail('commented', issue.key, issue.fields.customfield_10003, issue.fields.summary, issue.changelog));
		output[author].commented++;
	}
}

/**
 * Process a single issue object to record who closed it
 * @param  {Object} issue - An issue object
 */
function processClosed(issue) {
	if (!issue.changelog.histories) {
		return;
	}
	var histories = issue.changelog.histories;
	for (var i = histories.length - 1; i >= 0; i--) {
		var changelog = histories[i];
		var author = changelog.author.name;
		var created = moment(changelog.created);
		if (created.isBefore(start) || created.isAfter(end)) {
			continue;
		}
		for (var j = changelog.items.length - 1; j >= 0; j--) {
			var change = changelog.items[j];
			if (qe.indexOf(author) >= 0 && change.field === 'status' && change.fromString !== 'Closed' && change.toString === 'Closed') {
				var issueData = createDetail('closed', issue.key, issue.fields.customfield_10003, issue.fields.summary);
				output[author].detail.push(issueData);
				if (issueData.key.indexOf('QE') === 0) {
					output[author].closedQe++;
				} else if (issueData.key.indexOf('PROC') === 0) {
					output[author].closedProc++;
				} else {
					output[author].closedOther++;
					output[author].closedPoints += issueData.points;
				}
			}
		}
	}
}

/**
 * Process a single issue object to record what kinds of tests (automated or manual) were done
 * @param  {Object} issue - An issue object
 */
function processTests(issue) {
	if (!issue.changelog.histories) {
		return;
	}
	var histories = issue.changelog.histories;
	for (var i = histories.length - 1; i >= 0; i--) {
		var changelog = histories[i];
		var author = changelog.author.name;
		var created = moment(changelog.created);
		if (created.isBefore(start) || created.isAfter(end)) {
			continue;
		}
		for (var j = changelog.items.length - 1; j >= 0; j--) {
			var change = changelog.items[j];
			if (change.field === 'labels') {
				if (change.fromString.indexOf('qe-manualtest') < 0 && change.toString.indexOf('qe-manualtest') >= 0) {
					//jscs:disable requireCamelCaseOrUpperCaseIdentifiers
					if (author in output) {
						output[author].detail.push(createDetail('test-manual', issue.key, issue.fields.customfield_10003, issue.fields.summary));
						output[author].manualTest++;
					}
				}
				if (change.fromString.indexOf('qe-automatedtest') < 0 && change.toString.indexOf('qe-automatedtest') >= 0) {
					//jscs:disable requireCamelCaseOrUpperCaseIdentifiers
					if (author in output) {
						output[author].detail.push(createDetail('test-automated', issue.key, issue.fields.customfield_10003, issue.fields.summary));
						output[author].automatedTest++;
					}
				}
			}
		}
	}
}

/**
 * Process QE data
 */
function collectData(args, opts, callback) {

	var searchFiled = 'creator in membersOf(qe) AND createdDate >= "' + start.format('YYYY/MM/DD HH:MM') +
		'" AND createdDate <= "' + end.format('YYYY/MM/DD HH:MM') + '"';
	var searchCommented = createSearch('issueFunction in commented("by %1$s after %2$s before %3$s")', qe, start, end);
	var searchClosed = createSearch('Status CHANGED TO Closed DURING ("%2$s", "%3$s") by %1$s', qe, start, end);
	var searchTests = '(updatedDate >= "' + start.format('YYYY/MM/DD HH:MM') + '" and updatedDate <= "' + end.format('YYYY/MM/DD HH:MM') +
					'") and labels in (qe-automatedtest, qe-manualtest)';
	var optional = {maxResults:1000, expand:['changelog'],
					fields:['key', 'issuetype', 'components', 'labels', 'timeoriginalestimate', 'timespent', 'creator',
							'parent', 'customfield_10001', 'customfield_10003', 'summary']};

	for (var i = qe.length - 1; i >= 0; i--) {
		var tester = qe[i];
		if (!output[tester]) {
			output[tester] = {'filedQe':0, 'filedProc':0, 'filedOther':0, 'closedQe':0, 'closedProc':0, 'closedOther':0, 'closedPoints':0,
										'commented':0, 'manualTest':0, 'automatedTest':0,
							'detail': []};
		}
	}

	console.log('===============================');
	console.log('Begin data collection');
	console.log('Start Date: ' + start.format('llll'));
	console.log('End Date: ' + end.format('llll'));
	console.log('===============================');
	async.series([
		function(callback) {
			console.log('Retrieving filed tickets...');
			jira.searchJira(searchFiled, optional, function(error, data) { var obj = processData('filed', data, processFiled); callback(null, obj); });
		},
		function(callback) {
			console.log('Retrieving closed tickets...');
			jira.searchJira(searchClosed, optional, function(error, data) { var obj = processData('closed', data, processClosed); callback(null, obj); });
		},
		function(callback) {
			console.log('Retrieving commented tickets...');
			jira.searchJira(searchCommented, optional, function(error, data) { var obj = processData('commented', data, processCommented); callback(null, obj); });
		},
		function(callback) {
			console.log('Retrieving testing tickets...');
			jira.searchJira(searchTests, optional, function(error, data) { var obj = processData('testing', data, processTests); callback(null, obj); });
		}
	],
	// optional callback
	function(err, results) {
		console.log('Detail:');
		var details = new Table({
			head: ['Tester', 'Action', 'Ticket', 'Points', 'Summary'],
			colWidths: [20, 15, 15, 10, 110]
		});
		for (var key in output) {
			var result = output[key];
			for (var i = result.detail.length - 1; i >= 0; i--) {
				var detail = result.detail[i];
				details.push([key, detail.action, detail.key, detail.points, detail.summary.substr(0, 110)]);
			}
		}
		console.log(details.toString());
		var summary = new Table({
			head: ['Tester', 'Filed-QE', 'Filed-PROC', 'Filed-Other', 'Commented', 'Closed-QE', 'Closed-PROC', 'Closed-Other', 'Closed Points', 'Manual', 'Automated'],
					colWidths: [20, 15, 15, 15, 15, 15, 15, 15, 15, 12, 12]
		});
		console.log('Summary:');
		for (var key2 in output) {
			var result2 = output[key2];
			summary.push([key2, result2.filedQe, result2.filedProc, result2.filedOther, result2.commented, result2.closedQe,
				result2.closedProc, result2.closedOther, result2.closedPoints, result2.manualTest, result2.automatedTest]);
		}
		console.log(summary.toString());
	});
}

collectData();
