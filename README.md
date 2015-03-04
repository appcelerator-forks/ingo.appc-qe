# Appcelerator QE Data Collection

This could be better. This could be a proper CLI module. But it's not (yet). It does, however, generate useful JIRA data.

## Usage

1. Create a config.json file with the following information:

		var config = {
			host:"https://url-to-jira-host",
			port:443,
			user:"username",
			password:"password",
			start: "start date as ISO 8601",
			end: "end date as ISO 8601",
			users:['list', 'of', 'user', 'names']
			};
2. Run `appc-qe`.
3. Marvel in the data output.
