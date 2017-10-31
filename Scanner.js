/*
	Angel Fernando Carriola Monroy
*/
function Scanner(sourceText, buildMessagesCtrl)
{
	if (typeof sourceText != "string")
		throw "El origen del código fuente debe ser de tipo string";
	
	if (!(buildMessagesCtrl instanceof BuildMessages))
		throw "Escáner: Error interno, controlador de mensajes no especificado.";

	this.lexCode = {
		INVALID: -1, 
		TYPE: 0,
		IDENTIFIER: 1,
		INTEGER_CONSTANT: 2,
		FLOAT_CONSTANT: 3,
		ADDITIVE_OPERATOR: 4,
		MULTIPLICATIVE_OPERATOR: 5,
		RELATIONAL_OPERATOR: 6,
		LOGIC_OPERATOR: 7,
		EXCLAMATION: 8,
		EQUAL: 9,
		SEMILCOLON: 10,
		OPENING_CURLY_BRACKET: 11,
		CLOSING_CURLY_BRACKET: 12,
		OPENING_BRACKET: 13,
		CLOSING_BRACKET: 14,
		COMMA: 15,
		IF: 16,
		ELSE: 17,
		FOR: 18,
		WHILE: 19,
		CONTINUE: 20,
		BREAK: 21,
		SWITCH: 22,
		CASE: 23,
		COLON: 24,
		RETURN: 25,
		MAIN: 26,
		DEFAULT: 27,
		STRING: 28,
		CHAR_CONSTANT: 29,
		INCREMENT_OPERATOR: 30,
		BOOLEAN: 31,
		SASM: 32
	};
	this.sourceText = sourceText;
	this.buildMessagesCtrl = buildMessagesCtrl;
	this.scannerPos = -1; // si se cambian valores hay que actualizar el Reset
	this.scannerLine = 1; // si se cambian valores hay que actualizar el Reset
	this.scannerCol = -1; // si se cambian valores hay que actualizar el Reset
	this.EOF = false; 
	this.currentScanToken = null;
	this.tokenList = new TokenList();
	this.success = false;

	this.NextScannerPos = function()
	{
		if (this.scannerPos < this.sourceText.length)
		{
			this.scannerPos++;
			this.scannerCol++;
			if (this.scannerPos != this.sourceText.length && this.sourceText.charAt(this.scannerPos) == "\n")
			{
				this.scannerLine++;
				this.scannerCol = 0;
			}
		}
	};

	this.ScanNextToken = function()
	{
		this.currentScanToken = new Token(this.lexCode.INVALID, "", -1, -1, -1);
		this.NextScannerPos();

		// Se toma el primer carácter que no sea un tipo de espacio y está despues del token anterior (si hay) para formar el nuevo token.
		while (this.scannerPos < this.sourceText.length)
		{
			var newChar = this.sourceText[this.scannerPos];

			if (!this.IsSpace(newChar))
			{
				this.currentScanToken.value = newChar;
				break;
			}

			this.NextScannerPos();
		}

 		// Si ya no hay más carácteres que leer, entonces se cancela y se indica que ya se alcanzó el final.
		if (this.scannerPos >= this.sourceText.length)
		{
			this.EOF = true;
			return null;
		}

		this.currentScanToken.pos = this.scannerPos;
		this.currentScanToken.line = this.scannerLine;
		this.currentScanToken.col = this.scannerCol;

		if ( this.IsAdditiveOperator(this.currentScanToken.value) )
		{
			// Si es un Incremento se considera primero que el Aditivo.
			if (this.scannerPos + 1 < this.sourceText.length && this.IsIncrementOperator(this.currentScanToken.value + this.sourceText.charAt(this.scannerPos + 1)) )
			{
				this.NextScannerPos();
				this.currentScanToken.code = this.lexCode.INCREMENT_OPERATOR;
				this.currentScanToken.value += this.sourceText.charAt(this.scannerPos);
			}
			else
				this.currentScanToken.code = this.lexCode.ADDITIVE_OPERATOR;

			return this.currentScanToken;
		}

		if ( this.IsMultiplicativeOperator(this.currentScanToken.value) )
		{
			this.currentScanToken.code = this.lexCode.MULTIPLICATIVE_OPERATOR;
			return this.currentScanToken;
		}

		if ( this.IsRelationalOperator(this.currentScanToken.value) || this.scannerPos + 1 < this.sourceText.length && this.IsRelationalOperator(this.currentScanToken.value + this.sourceText.charAt(this.scannerPos + 1)) )
		{
			this.currentScanToken.code = this.lexCode.RELATIONAL_OPERATOR;

			while ( this.scannerPos + 1 < this.sourceText.length && this.IsRelationalOperator(this.currentScanToken.value + this.sourceText.charAt(this.scannerPos + 1)) )
			{
				this.NextScannerPos();
				this.currentScanToken.value += this.sourceText.charAt(this.scannerPos);
			}

			return this.currentScanToken;
		}

		// Operadores lógicos
		if ( this.scannerPos + 1 < this.sourceText.length && this.IsLogicOperator(this.currentScanToken.value + this.sourceText.charAt(this.scannerPos + 1)) )
		{
			this.NextScannerPos();
			this.currentScanToken.code = this.lexCode.LOGIC_OPERATOR;
			this.currentScanToken.value += this.sourceText.charAt(this.scannerPos);
			return this.currentScanToken;
		}

		// Si el token empieza con una letra entonces lee toda la palabra posible para posteriormenete saber si es un identificador, tipo nativo o una palabra reservada (el orden de elección es obligatoria).

		if ( this.IsWord(this.currentScanToken.value) )
		{
			while ( this.scannerPos + 1 < this.sourceText.length && this.IsWord(this.currentScanToken.value + this.sourceText.charAt(this.scannerPos + 1)) )
			{
				this.NextScannerPos();
				this.currentScanToken.value += this.sourceText.charAt(this.scannerPos);
			}
		}

		if ( this.IsType(this.currentScanToken.value) )
		{
			this.currentScanToken.code = this.lexCode.TYPE;
			return this.currentScanToken;
		}

		if ( this.IsBoolean(this.currentScanToken.value) )
		{
			this.currentScanToken.code = this.lexCode.BOOLEAN;
			return this.currentScanToken;
		}

		if ( this.IsKeyword(this.currentScanToken.value) )
		{
			// if|else|for|while|continue|break|switch|case|return|main|default
			switch(this.currentScanToken.value)
			{
				case "if":
					this.currentScanToken.code = this.lexCode.IF;
					break;
				case "else":
					this.currentScanToken.code = this.lexCode.ELSE;
					break;
				case "for":
					this.currentScanToken.code = this.lexCode.FOR;
					break;
				case "while":
					this.currentScanToken.code = this.lexCode.WHILE;
					break;
				case "continue":
					this.currentScanToken.code = this.lexCode.CONTINUE;
					break;
				case "break":
					this.currentScanToken.code = this.lexCode.BREAK;
					break;
				case "switch":
					this.currentScanToken.code = this.lexCode.SWITCH;
					break;
				case "case":
					this.currentScanToken.code = this.lexCode.CASE;
					break;
				case "return":
					this.currentScanToken.code = this.lexCode.RETURN;
					break;
				case "main":
					this.currentScanToken.code = this.lexCode.MAIN;
					break;
				case "default":
					this.currentScanToken.code = this.lexCode.DEFAULT;
					break;
				case "print_int":
					this.currentScanToken.code = this.lexCode.SASM;
					break;
				case "newline":
					this.currentScanToken.code = this.lexCode.SASM;
					break;
			}
			return this.currentScanToken;
		}

		if ( this.IsIdentifier(this.currentScanToken.value) )
		{
			this.currentScanToken.code = this.lexCode.IDENTIFIER;
			return this.currentScanToken;
		}

		// Si comienza con un número entonces se busca toda la cadena de números existente.
		if ( this.IsIntegerConstant(this.currentScanToken.value) )
		{
			while ( this.scannerPos + 1 < this.sourceText.length && this.IsIntegerConstant(this.currentScanToken.value + this.sourceText.charAt(this.scannerPos + 1)) )
			{
				this.NextScannerPos();
				this.currentScanToken.value += this.sourceText.charAt(this.scannerPos);
			}
		}

		// Si es un entero también puede ser un flotante en caso de seguirle un "." y un número, así que se escanea todos los decimales restantes.
		if ( this.IsIntegerConstant(this.currentScanToken.value) 
				&& this.scannerPos + 2 < this.sourceText.length
				&& this.IsFloatConstant( this.currentScanToken.value + this.sourceText.charAt(this.scannerPos + 1) + this.sourceText.charAt(this.scannerPos + 2) )	)
		{
			this.NextScannerPos();
			this.NextScannerPos();
			this.currentScanToken.value += "." + this.sourceText.charAt(this.scannerPos);

			while ( this.scannerPos + 1 < this.sourceText.length && this.IsFloatConstant(this.currentScanToken.value + this.sourceText.charAt(this.scannerPos + 1)) )
			{
				this.NextScannerPos();
				this.currentScanToken.value += this.sourceText.charAt(this.scannerPos);
			}
		}

		if ( this.IsIntegerConstant(this.currentScanToken.value) )
		{
			this.currentScanToken.code = this.lexCode.INTEGER_CONSTANT;
			return this.currentScanToken;
		}

		if ( this.IsFloatConstant(this.currentScanToken.value) )
		{
			this.currentScanToken.code = this.lexCode.FLOAT_CONSTANT;
			return this.currentScanToken;
		}		

		// Si comienza con comilla doble se explora para un posible string
		if ( this.currentScanToken.value == "\"")
		{
			// Hasta que no encuentra la comilla doble de cierre, no se termina de explorar.
			do
			{
				this.NextScannerPos();
				this.currentScanToken.value += this.sourceText.charAt(this.scannerPos);
			}
			while (this.scannerPos < this.sourceText.length && ! this.IsString(this.currentScanToken.value));

			if ( this.IsString(this.currentScanToken.value) )
			{
				this.currentScanToken.code = this.lexCode.STRING;
				return this.currentScanToken;
			}

			throw new Error("Cadena interminable, se esperaba \"", this.scannerLine, this.scannerCol, this.buildMessagesCtrl.errorType.ERROR);;
		}

		// Si comienza con comilla simple se explora para un posible carácter constante
		if ( this.currentScanToken.value == "'")
		{
			// Hasta que no encuentra la comilla simple de cierre, no se termina de explorar.
			do
			{
				this.NextScannerPos();
				this.currentScanToken.value += this.sourceText.charAt(this.scannerPos);
			}
			while (this.scannerPos < this.sourceText.length && ! this.IsCharConstant(this.currentScanToken.value))


			if ( this.IsCharConstant(this.currentScanToken.value) )
			{
				this.currentScanToken.code = this.lexCode.CHAR_CONSTANT;
				return this.currentScanToken;
			}

			throw new Error("Carácter interminable, se esperaba \'", this.scannerLine, this.scannerCol, this.buildMessagesCtrl.errorType.ERROR);;
		}

		// Tokens de un solo carácter.
		switch(this.currentScanToken.value)
		{
			case "!":
				this.currentScanToken.code = this.lexCode.EXCLAMATION;
				break;
			case "=":
				this.currentScanToken.code = this.lexCode.EQUAL;
				break;
			case ";":
				this.currentScanToken.code = this.lexCode.SEMILCOLON;
				break;
			case "{":
				this.currentScanToken.code = this.lexCode.OPENING_CURLY_BRACKET;
				break;
			case "}":
				this.currentScanToken.code = this.lexCode.CLOSING_CURLY_BRACKET;
				break;
			case "(":
				this.currentScanToken.code = this.lexCode.OPENING_BRACKET;
				break;
			case ")":
				this.currentScanToken.code = this.lexCode.CLOSING_BRACKET;
				break;
			case ",":
				this.currentScanToken.code = this.lexCode.COMMA;
				break;
			case ":":
				this.currentScanToken.code = this.lexCode.COLON;
				break;
		}

		// Si ya se encontró un token válido se termina aquí.
		if ( this.currentScanToken.code != this.lexCode.INVALID )
			return this.currentScanToken;

		throw new Error("Token inesperado " + this.currentScanToken.value, this.scannerLine, this.scannerCol, this.buildMessagesCtrl.errorType.ERROR);
	};

	this.Start = function()
	{
		this.Reset();
		this.buildMessagesCtrl.AddCaption("Inicio del análisis léxico.");

		while( !this.EOF )
		{
			try
			{
				var token = this.ScanNextToken();
				if ( token != null )
					this.tokenList.Add(token);
				this.success = true;
			}
			catch(error)
			{
				if (error instanceof Error)
				{
					this.tokenList.Add(this.currentScanToken); // igual se pone el token inválido para que el análisis no se brinque este token
					this.buildMessagesCtrl.AddError(error.message, error.line, error.col, error.type);
				}
				else
					throw error;
			}
		}

		this.buildMessagesCtrl.AddCaption("Fin del análisis léxico.");
	};

	this.IsWord = function(str)
	{
		var exp = /^[a-z_][a-z0-9_]*$/i;

		return exp.test(str);
	};

	this.IsType = function(str)
	{
		var exp = /^(int|double|float|char|string|bool|void)$/;

		return exp.test(str);
	};

	this.IsIdentifier = function(str)
	{
		var exp = /^[a-z_][a-z0-9_]*$/i;

		return exp.test(str) && !this.IsKeyword(str);
	};

	this.IsIntegerConstant = function(str)
	{
		var exp = /^([1-9][0-9]*|0)$/;

		return exp.test(str);
	};

	this.IsFloatConstant = function(str)
	{
		var exp = /^([1-9][0-9]*|0)\.[0-9]+$/;

		return exp.test(str);
	};

	this.IsAdditiveOperator = function(char)
	{
		var exp = /\+|-/;

		return exp.test(char);
	};

	this.IsMultiplicativeOperator = function(char)
	{
		var exp = /\*|\/|%/;

		return exp.test(char);
	};

	this.IsRelationalOperator = function(str)
	{
		var exp = /^(==|<=|>=|!=|<|>)$/;

		return exp.test(str);
	};

	this.IsLogicOperator = function(str)
	{
		var exp = /^(&&|\|\|)$/;

		return exp.test(str);
	};

	this.IsString = function(str)
	{
		if (str.charAt(0) != "\"")
			return false;

		for (var i = 2; i < str.length-1; i++)
		{
			var ch = str.charAt(i);
			var ch_left = str.charAt(i-1);

			if (ch == "\"" && ch_left != "\\")
				return false;
		}

		if (str.length == 1 || str.charAt(str.length-1) != "\"")
			return false;

		return true;
	};

	this.IsCharConstant = function(str)
	{
		if (str.charAt(0) != "'")
			return false;

		for (var i = 2; i < str.length-1; i++)
		{
			var ch = str.charAt(i);
			var ch_left = str.charAt(i-1);

			if (ch == "\"" && ch_left != "\\")
				return false;
		}

		if (str.length == 1 || str.charAt(str.length-1) != "'")
			return false;

		return true;
	}

	this.IsKeyword = function(str)
	{
		var exp = /^(if|else|for|while|continue|break|switch|case|return|main|default|print_int|newline)$/;

		return exp.test(str) || this.IsType(str);
	};

	this.IsIncrementOperator = function(str)
	{
		return str == "++" || str == "--";
	};

	this.IsBoolean = function(str)
	{
		return str == "true" || str == "false";
	};

	// Devuelve true si el carácter es algún tipo de espacio.
	this.IsSpace = function(char)
	{
		return / |\n|\r|\t/.test(char);
	};

	this.Reset = function()
	{
		this.scannerPos = -1;
		this.scannerLine = 1;
		this.scannerCol = -1;
		this.tokenList = new TokenList();
		this.EOF = false;
		this.success = false;
	}
}


function Token(code, value, pos, line, col)
{
	this.code = code;
	this.value = value;
	this.pos = pos;
	this.line = line;
	this.col = col;
}

function TokenList()
{
	var begin = new Token(-1, "", -1, -1, -1); // token indicador del comienzo del iterador (no es un token válido y es antes del primer token válido).
	var end = new Token(-1, "", -1, -1, -1); // token indicador del final del iterador (no es un token válido y es después del último token válido).
	var current = this.begin;
	this.list = new Array();
	var pos = -1;

	this.Pos = function(p)
	{
		if (p == undefined || p == null)
			return pos;

		if ( p < 0 )
		{
			pos = -1;
			current = begin;
		}
		else if ( p >= this.list.length )
		{
			pos = this.list.length;
			current = end;
		}
		else
		{
			current = this.list[p];
			pos = p;
		}

		return pos;
	};

	this.Current = function()
	{
		return current;
	}

	this.Begin = function()
	{
		return begin;
	};

	this.End = function()
	{
		return end;
	};

	this.Add = function(token)
	{
		if (!(token instanceof Token))
			throw "El token no es una instancia del tipo Token.";

		this.list.push(token);

		// Actualiza la información dtoken token indicador de inicio.
		if (this.list.length == 1)
		{
			begin.pos = token.pos;
			begin.line = token.line;
			begin.col = token.col;
		}
		// Actualiza la información dtoken token indicador de final.
		end.pos = token.pos+token.value.length;
		end.line = token.line;
		end.col = token.col+token.value.length;
	}

	this.Next = function()
	{
		this.Pos(pos+1);

		return current;
	};

	this.Previous = function()
	{
		this.Pos(pos-1);

		return current;
	};

}