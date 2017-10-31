/*
	Angel Fernando Carriola Monroy
*/
function BuildMessages(outputDiv)
{
	this.errorType = {
		ERROR: 1,
		WARNING: 2
	};

	this.outputDiv = outputDiv;
	this.messages = new Array();
	this.errors = new Array();

	this.AddError = function(message, line, col, type)
	{
		if (type != this.errorType.ERROR && type != this.errorType.WARNING)
			throw "BuildMessages: tipo de error no reconocido.";

		var newerror = new Error(message, line, col, type);
		this.messages.push(newerror);
		this.errors.push(newerror);
		this.UpdateOutput();
	}

	this.AddCaption = function(caption)
	{
		this.messages.push(new Caption(caption));
		this.UpdateOutput();
	}

	this.UpdateOutput = function()
	{
		var output = "<table class='table table-hover'><tr><th>Línea</th><th>Columna</th><th>Mensaje</th></tr>";
		var annonations = [];
		for (var i = 0; i < this.messages.length; i++)
		{
			var message = this.messages[i];
			if ( message instanceof Error )
			{
				editor.gotoLine(message.line);
				annonations.push({
				  row: message.line-1,
				  column: message.col-1,
				  text: message.message,
				  type: message.type == this.errorType.ERROR ? "error" : "warning"
				});
				if (message.type == this.errorType.ERROR)
					output += "<tr class='danger'><td>" + message.line + "</td><td>" + message.col + "</td><td>" + message.message + "</td></tr>";
				else if (message.type == this.errorType.WARNING)
					output += "<tr class='warning'><td>" + message.line + "</td><td>" + message.col + "</td><td>" + message.message + "</td></tr>";
			}
			else if ( message instanceof Caption )
			{
				output += "<tr class=''><td></td><td></td><td><i>" + message.caption + "</i></td></tr>";
			}
		}
		output += "</table>";

		this.outputDiv.innerHTML = output;
		editor.getSession().setAnnotations(annonations);
	}

	this.Clear = function()
	{
		this.messages = new Array();
		this.UpdateOutput();
	}
}

function Error(message, line, col, type)
{
	this.message = message;
	this.line = line;
	this.col = col;
	this.type = type;
}

function Caption(caption)
{
	this.caption = caption;
}

