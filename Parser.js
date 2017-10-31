/*
	Angel Fernando Carriola Monroy
*/
function Parser(tokenList, lexCode, buildMessagesCtrl)
{
	if (!(tokenList instanceof TokenList))
		throw "Analizador: Error interno, lista de tokens no especificada.";
	
	if (!(buildMessagesCtrl instanceof BuildMessages))
		throw "Analizador: Error interno, controlador de mensajes no especificado.";

	this.tokenList = tokenList;
	this.lexCode = lexCode;
	this.buildMessagesCtrl = buildMessagesCtrl;
	this.tree = null; // cuándo termine el análisis este árbol únicamente se generará si no hubo ningún error sintático.
	this.success = false;

	this.Start = function()
	{
		this.success = false;
		this.buildMessagesCtrl.AddCaption("Inicio del análisis sintáctico.");
		//this.Program();
		try
		{
			this.Program();
			this.success = true;
		}
		catch(error)
		{
			if (error instanceof Error)
			
				this.buildMessagesCtrl.AddError(error.message, error.line, error.col, error.type);
			else
				throw error;
		}
		this.buildMessagesCtrl.AddCaption("Fin del análisis sintáctico.");
	}

//	1.	<Programa> --> <Contenido Global> <Más Contenido Global>
	this.Program = function()
	{
		this.tree = new RootNode("Program");
		this.GlobalContent(this.tree);
		this.MoreGlobalContent(this.tree);
	}

//	2.	<Contenido Global> --> <Declaración> ";" | <Función>
	this.GlobalContent = function(parent)
	{
		var node = new InternalNode("GlobalContent");

		if ( this.Declaration(node) )
		{
			var token = this.tokenList.Next();
			if (token.value == ";")
			{
				node.AddChild(new LeafNode(token));
				parent.AddChild(node);
				return true;
			}
			else
			{
				this.tokenList.Previous();
				throw new Error("Declaración no terminada, se esperaba ; antes del token "+token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
			}

		}
		else if ( this.Function(node) )
		{
			parent.AddChild(node);
			return true;
		}
		else 
		{
			var token = this.tokenList.Next();

			if (token != this.tokenList.End())
			{
				if (token.code == this.lexCode.IDENTIFIER)
				{
					throw new Error(token.value + " no es un tipo.", token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
				}
				else
				{
					this.tokenList.Previous();
					throw new Error("Token "+ token.value +" inesperado.", token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
				}
			}
		}
		
		return false;
	}

//	3.	<Más Contenido Global> --> <Contenido Global> <Más Contenido Global> | vacío
	this.MoreGlobalContent = function(parent)
	{
		var node = new InternalNode("MoreGlobalContent");

		if (this.GlobalContent(node))
		{
			parent.AddChild(node);
			this.MoreGlobalContent(node);
		}
	}

//	4.	<Bloque> --> "{" <Contenido Bloque> "}"
	this.Block = function(parent)
	{
		var node = new InternalNode("Block");

		var token = this.tokenList.Next();

		if (token.value == "{" )
		{
			node.AddChild(new LeafNode(token));

			this.BlockContent(node);
			var token1 = this.tokenList.Next();

			if (token1.value == "}")
			{
				node.AddChild(new LeafNode(token1));
				parent.AddChild(node);
				return true;
			}
			else
			{
				this.tokenList.Previous();
				this.tokenList.Previous();
				throw new Error("Bloque de instrucciones no terminado, se esperaba } antes del token " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}
		else
			this.tokenList.Previous();

		return false;
	}

//	5.	<Contenido Bloque> --> <Sentencia> <Contenido Bloque> | <If> <Contenido Bloque> | <For> <Contenido Bloque> | <While> <Contenido Bloque> | <Switch> <Contenido Bloque> | <Retorno Función> <Contenido Bloque> | vacío
	this.BlockContent = function(parent)
	{
		var node = new InternalNode("BlockContent");

		if ( this.Sentence(node) 
			|| this.If(node)
			|| this.FunctionReturn(node)
			|| this.For(node)
			|| this.While(node)
			/*|| this.Switch(node)*/)
		{
			parent.AddChild(node);
			this.BlockContent(node);
		}
		else
		{
			var token = this.tokenList.Next();
			if (/^(if|else|for|while|continue|break|switch|case|return|main|default)$/.test(token.value))
			{
				this.tokenList.Previous();
				throw new Error("No se esperaba el token " + token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);	
			}
			else
				this.tokenList.Previous();
		}
	}

//	6.	<Cuerpo Estructura> --> <Bloque> | <Sentencia> | ";"
	this.StructureBody = function(parent)
	{
		var node = new InternalNode("StructureBody");

		if ( this.Block(node) || this.Sentence(node) )
		{
			parent.AddChild(node);
			return true;
		}

		var token = this.tokenList.Next();

		if ( token.value == ";" )
		{
			node.AddChild(new LeafNode(token));
			parent.AddChild(node);

			return true;
		}

		this.tokenList.Previous();

		return false;
	}

//	7.	<Sentencia> --> <Declaración> ";" | <Asignación> ";" | <Expresión> ";" | "break" ";" | "continue" ";"
	this.Sentence = function(parent)
	{
		var node = new InternalNode("Sentence");
		var isFlowControl = false;
		var token = this.tokenList.Next();

		switch(token.value)
		{
			case "break":
			case "continue":
				isFlowControl = true;
				node.AddChild(new LeafNode(token));
			break;
			default:
				this.tokenList.Previous();
		}

		// la forma de evaluar cada una de las reglas se hace así porque puede haber ambiguedad entre ellas y de esta manera aseguramos que se evaulúe cada una.
		var expressionError = null, declarationError = null, assigmentError = null;
		var isExpression = false, isDeclaration = false, isAssigment = false;

		try{
			isDeclaration = this.Declaration(node);
		}
		catch(e){declarationError = e;}

		try{
			isAssigment = this.Assignment(node);
		}
		catch(e){assigmentError = e;}

		try{
			isExpression = this.Expression(node);
		}
		catch(e){expressionError = e;}

		if (isExpression || isDeclaration || isAssigment || isFlowControl)
		{
			var token = this.tokenList.Next();
			if ( token.value == ";" )
			{
				node.AddChild(new LeafNode(token));
				parent.AddChild(node);

				return true;
			}
			this.tokenList.Previous();
			if (isFlowControl)
				this.tokenList.Previous();
			throw new Error("Se esperaba ; antes del token " + token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
		}
		else //  si todas las reglas fallaron se muestra el mensaje de error del que haya fallado y en caso de que falle más de uno, se toma un orden de preferencia.
		{
			if (declarationError)
				throw declarationError;
			if (assigmentError)
				throw assigmentError;
			if (expressionError)
				throw expressionError;
		}
	
		return false;
	};

/** Inicio: Reglas para Declaración **/

//	8.	<Declaración> --> <Tipo> <Identificador> <Asignación Declaración> <Declaración Múltiple>
	this.Declaration = function(parent)
	{
		var node = new InternalNode("Declaration");
		var token = this.tokenList.Next();

		if (token.code == this.lexCode.TYPE)
		{
			node.AddChild(new LeafNode(token));
			var token1 = this.tokenList.Next();

			if (token1.code == this.lexCode.IDENTIFIER)
			{
				node.AddChild(new LeafNode(token1));

				var token2 = this.tokenList.Next();

				if (token2.value == "(") // Se devuelven los token en caso de ser una posible declaración de función
				{
					this.tokenList.Previous(); // token2
					this.tokenList.Previous(); // token1
					this.tokenList.Previous(); // token
					return false;
				}
				else
					this.tokenList.Previous();

				this.AssignmentStatement(node)
				this.MultipleDeclaration(node);
				parent.AddChild(node);
				return true;		
			}	
			else if (token1.value == "main") // en caso que sea la función main() también se devuelven los tokens.
			{
				var token2 = this.tokenList.Next();
				if (token2.value == "(")
				{
					this.tokenList.Previous(); // token2
					this.tokenList.Previous(); // token1
					this.tokenList.Previous(); // token	
					return false;
				}
				else
					this.tokenList.Previous();
			}

			this.tokenList.Previous();
			this.tokenList.Previous();
			throw new Error("Se esperaba identificador después del tipo " + token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);	
		}
		else
			this.tokenList.Previous();

		return false;
	};

//	9.	<Declaración Múltiple> --> "," <Identificador> <Asignación Declaración> <Declaración Múltiple> | vacío

	this.MultipleDeclaration = function(parent)
	{
		var node = new InternalNode("MultipleDeclaration");

		var token = this.tokenList.Next();

		if (token.value == ",")
		{
			node.AddChild(new LeafNode(token));

			var token1 = this.tokenList.Next();
			if (token1.code == this.lexCode.IDENTIFIER)
			{
				node.AddChild(new LeafNode(token1));
				this.AssignmentStatement(node);
				this.MultipleDeclaration(node);
				parent.AddChild(node);
			}
			else
			{
				this.tokenList.Previous();
				this.tokenList.Previous();
				throw new Error("Se esperaba un identificador después del token ,", token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}
		else
		{
			this.tokenList.Previous();
		}
	};

/** Fin: Reglas para Declaración **/

//	10.	<Asignación Declaración> --> "=" <Expresión> | vacío

	this.AssignmentStatement = function(parent)
	{
		var node = new InternalNode("AssignmentStatement");	

		var token = this.tokenList.Next();

		if (token.value == "=")
		{
			node.AddChild(new LeafNode(token));
			if (this.Expression(node))
			{
				parent.AddChild(node);
			}
			else
			{
				this.tokenList.Previous();
				throw new Error("Se esperaba una asignación después de =", token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}
		else
			this.tokenList.Previous();
	};

//	11.	<Asignación> --> <Identificador> "=" <Expresión>
	this.Assignment = function(parent)
	{
		var node = new InternalNode("Assignment");	
		var token = this.tokenList.Next();

		if (token.code == this.lexCode.IDENTIFIER)
		{
			node.AddChild(new LeafNode(token));
			var token1 = this.tokenList.Next();
			if (token1.value == "=")
			{
				node.AddChild(new LeafNode(token1));
				if (this.Expression(node))
				{
					parent.AddChild(node);

					return true;
				}
				else
				{
					this.tokenList.Previous();
					this.tokenList.Previous();
					throw new Error("Se esperaba una asignación después del token  =", token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
				}
			}
			else if (token1.value == "(")  // Se devuelven los tokens sin mostrar error para permitir al analizador verificar si se traza de una llamada a función.
			{
				this.tokenList.Previous(); // token1
				this.tokenList.Previous(); // token
				return false;
			}
			
			this.tokenList.Previous();
			this.tokenList.Previous();
			throw new Error("Se esperaba una asignación o llamada a función para el identificador " + token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
		}
		else
			this.tokenList.Previous();

		return false;
	};

/** Inicio: Reglas para IF **/

//	12.	<If> --> "if (" <Expresión> ")" <Cuerpo Estructura> <Else>

	this.If = function(parent)
	{
		var node = new InternalNode("If");	

		var token = this.tokenList.Next();

		if (token.value == "if")
		{
			node.AddChild(new LeafNode(token));

			var token1 = this.tokenList.Next();

			if (token1.value == "(")
			{
				node.AddChild(new LeafNode(token1));

				if (this.Expression(node))
				{
					var token2 = this.tokenList.Next();

					if (token2.value == ")")
					{
						node.AddChild(new LeafNode(token2));

						if (this.StructureBody(node))
						{
							this.Else(node); // tiene vacío
							parent.AddChild(node);

							return true;
						}
						else
						{
							this.tokenList.Previous();
							this.tokenList.Previous();
							this.tokenList.Previous();
							throw new Error("Se esperaba una sentencia, un bloque de sentencias o ; después del token " + token2.value, token2.line, token2.col, this.buildMessagesCtrl.errorType.ERROR);
						}
					}
					else
					{
						this.tokenList.Previous();
						this.tokenList.Previous();
						this.tokenList.Previous();
						throw new Error("Condicional incompleta, se esperaba ) antes del token " + token2.value, token2.line, token2.col, this.buildMessagesCtrl.errorType.ERROR);
					}
				} 
				else
				{
					this.tokenList.Previous();
					this.tokenList.Previous();
					throw new Error("Se esperaba una expresión condicional.", token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
				}
			}
			else
			{
				this.tokenList.Previous();
				this.tokenList.Previous();
				throw new Error("Se esperaba ( antes del token " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}
		else
			this.tokenList.Previous();

		return false;
	};

//	13.	<Else> --> "else if (" <Expresión> ")" <CuerpoEstructura> <Else> | "else" <Cuerpo Estructura> | <vacío>
	this.Else = function(parent)
	{
		var node = new InternalNode("Else");	

		var token = this.tokenList.Next();
		if (token.value == "else")
		{
			node.AddChild(new LeafNode(token));
			var token1 = this.tokenList.Next();

			if (token1.value == "if")
			{
				node.AddChild(new LeafNode(token1));
				var token2 = this.tokenList.Next();

				if (token2.value == "(")
				{
					node.AddChild(new LeafNode(token2));

					if (this.Expression(node))
					{
						var token3 = this.tokenList.Next();

						if (token3.value == ")")
						{
							node.AddChild(new LeafNode(token3));

							if (this.StructureBody(node))
							{
								this.Else(node);
								parent.AddChild(node);
							}
						}
						else
						{
							this.tokenList.Previous();
							this.tokenList.Previous();
							this.tokenList.Previous();
							this.tokenList.Previous();
							throw new Error("Condicional incompleta, se esperaba ) antes del token " + token3.value, token3.line, token3.col, this.buildMessagesCtrl.errorType.ERROR);
						}
					}
					else
					{
						this.tokenList.Previous();
						this.tokenList.Previous();
						this.tokenList.Previous();
						throw new Error("Se esperaba una expresión condicional.", token2.line, token2.col, this.buildMessagesCtrl.errorType.ERROR);
					}
				}
				else
				{
					this.tokenList.Previous();
					this.tokenList.Previous();
					this.tokenList.Previous();
					throw new Error("Se esperaba ( antes del token " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
				}
			}
			else // si no hay if igualmente se acepta en caso que sea un else {...}
			{
				this.tokenList.Previous();
				if ( this.StructureBody(node) )
				{
					parent.AddChild(node);
				}
				else
				{
					this.tokenList.Previous();
					this.tokenList.Previous();
					throw new Error("Se esperaba una sentencia, un bloque de sentencias o ; antes del token " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
				}
			}
		}
		else
			this.tokenList.Previous();
	}

/** Fin: Reglas para IF **/

/** Inicio: Reglas para FOR **/

//	14.	<For> --> "For (" <Control Variable For> ";" <Control Condicional For> ";" <Incremento For> ")" <Cuerpo Estructura>
	this.For = function(parent)
	{
		var node = new InternalNode("For");
		var token = this.tokenList.Next();

		if (token.value == "for")
		{
			node.AddChild(new LeafNode(token));
			var token1 = this.tokenList.Next();

			if (token1.value == "(")
			{
				node.AddChild(new LeafNode(token1));
				this.ForVariableControl(node);
				var token2 = this.tokenList.Next();

				if (token2.value == ";")
				{	
					node.AddChild(new LeafNode(token2));
					this.ForConditionalControl(node);
					var token3 = this.tokenList.Next();

					if (token3.value == ";")
					{
						node.AddChild(new LeafNode(token3));
						this.ForIncrement(node);
						var token4 = this.tokenList.Next();

						if (token4.value == ")")
						{
							node.AddChild(new LeafNode(token4));
							if (this.StructureBody(node))
							{
								parent.AddChild(node);
								return true;
							}
							else
							{
								this.tokenList.Previous();
								this.tokenList.Previous();
								this.tokenList.Previous();
								this.tokenList.Previous();
								this.tokenList.Previous();
								throw new Error("Se esperaba una sentencia, bloque de sentencias o ; antes del token " + token4.value, token4.line, token4.col, this.buildMessagesCtrl.errorType.ERROR);
							}
						}
						else
						{
							this.tokenList.Previous();
							this.tokenList.Previous();
							this.tokenList.Previous();
							this.tokenList.Previous();
							this.tokenList.Previous();
							throw new Error("Se esperaba ) antes del token " + token4.value, token4.line, token4.col, this.buildMessagesCtrl.errorType.ERROR);
						}
					}
					else
					{
						this.tokenList.Previous();
						this.tokenList.Previous();
						this.tokenList.Previous();
						this.tokenList.Previous();
						throw new Error("Se esperaba ; antes del token " + token3.value, token3.line, token3.col, this.buildMessagesCtrl.errorType.ERROR);
					}
				}
				else
				{
					this.tokenList.Previous();
					this.tokenList.Previous();
					this.tokenList.Previous();
					throw new Error("Se esperaba ; antes del token " + token2.value, token2.line, token2.col, this.buildMessagesCtrl.errorType.ERROR);
				}
			}
			else
			{
				this.tokenList.Previous();
				this.tokenList.Previous();
				throw new Error("Se esperaba ( antes del token " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}	
		else
			this.tokenList.Previous();

		return false;
	}

//	15.	<Control Variable For> --> <Declaración> | <Asignación> | vacío
	this.ForVariableControl = function(parent)
	{
		var node = new InternalNode("ForVariableControl");
		
		if (this.Declaration(node) || this.Assignment(node))
			parent.AddChild(node);
	}

//	16.	<Control Condicional For> --> <Expresión> | vacío
	this.ForConditionalControl = function(parent)
	{
		var node = new InternalNode("ForConditionalControl");
		if (this.Expression(node))
			parent.AddChild(node);
	}

//	17.	<Incremento For> --> <Expresión> | <Asignación> | vacío
	this.ForIncrement = function(parent)
	{
		var node = new InternalNode("ForIncrement");
		if (this.Expression(node) || this.Assignment(node))
			parent.AddChild(node);
	}

//	18.	<While> --> "while (" <Expresión> ")" <Cuerpo Estructura>
	this.While = function(parent)
	{
		var node = new InternalNode("While");
		var token = this.tokenList.Next();

		if (token.value == "while")
		{
			node.AddChild(new LeafNode(token));
			var token1 = this.tokenList.Next();
			if (token1.value == "(")
			{
				node.AddChild(new LeafNode(token1));
				if (this.Expression(node))
				{
					var token2 = this.tokenList.Next();
					if (token2.value == ")")
					{
						node.AddChild(new LeafNode(token2));
						if (this.StructureBody(node))
						{
							parent.AddChild(node);
							return true;
						}
						else
						{
							this.tokenList.Previous();
							this.tokenList.Previous();
							this.tokenList.Previous();
							throw new Error("Se esperaba una sentencia, bloque de sentencias después del token " + token2.value, token2.line, token2.col, this.buildMessagesCtrl.errorType.ERROR);	
						}
					}
					else
					{
						this.tokenList.Previous();
						this.tokenList.Previous();
						this.tokenList.Previous();
						throw new Error("Se esperaba ) antes del token " + token2.value, token2.line, token2.col, this.buildMessagesCtrl.errorType.ERROR);	
					}	
				}
				else
				{	
					this.tokenList.Previous();
					this.tokenList.Previous();
					throw new Error("Se esperaba una expresión después del token " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);	
				}	
			}
			else
			{
				this.tokenList.Previous();
				this.tokenList.Previous();
				throw new Error("Se esperaba un ( antes del token " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);	
			}			
		}
		else
			this.tokenList.Previous();

		return false;
	}

/** Fin: Reglas para FOR **/

/** Inicio: Reglas para Funciones **/

//	25.	<Función> --> <Tipo> <Identificador> "(" <Parámetro Función> ")" <Bloque>
	this.Function = function(parent)
	{
		var node = new InternalNode("Function");
		var token = this.tokenList.Next();

		if (token.code == this.lexCode.TYPE)
		{
			node.AddChild(new LeafNode(token));
			var token1 = this.tokenList.Next();

			if (token1.code == this.lexCode.IDENTIFIER || token1.value == "main")
			{
				node.AddChild(new LeafNode(token1));
				var token2 = this.tokenList.Next();

				if (token2.value == "(")
				{
					node.AddChild(new LeafNode(token2));
					this.FunctionParameter(node);
					var token3 = this.tokenList.Next();

					if (token3.value == ")")
					{
						node.AddChild(new LeafNode(token3));

						if (this.Block(node))
						{
							parent.AddChild(node);
							return true;
						}
						else
						{
							this.tokenList.Previous();
							this.tokenList.Previous();
							this.tokenList.Previous();
							this.tokenList.Previous();
							throw new Error("Se esperaba {} del token " + token3.value, token3.line, token3.col, this.buildMessagesCtrl.errorType.ERROR);
						}
					}
					else
					{
						this.tokenList.Previous();
						this.tokenList.Previous();
						this.tokenList.Previous();
						this.tokenList.Previous();
						throw new Error("Se esperaba ) antes del token " + token3.value, token3.line, token3.col, this.buildMessagesCtrl.errorType.ERROR);
					}
				}
				else if (token2.value == "=" || token2.value == ";" || token2.value ==",") // se devuelven los tokens si se tratase de una posible declaración
				{	
					this.tokenList.Previous(); // token2
					this.tokenList.Previous(); // token1
					this.tokenList.Previous(); // token

					return false; // no se genera error porque debe darle la oportunidad al analizador de encontrar si se trata de otro tipo de regla.
				} 
			}
			else
			{
				this.tokenList.Previous();
				this.tokenList.Previous();
				throw new Error("Se esperaba un identificador antes del token " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}
		else
			this.tokenList.Previous();

		return false;
	};

//	26.	<Parámetro Función> --> <Tipo> <Identificador> <Más Parámetros Función> | vacío
	this.FunctionParameter = function(parent)
	{
		var node = new InternalNode("FunctionParameter");
		var token = this.tokenList.Next();

		if (token.code == this.lexCode.TYPE)
		{
			node.AddChild(new LeafNode(token));
			var token1 = this.tokenList.Next();

			if (token1.code == this.lexCode.IDENTIFIER)
			{
				node.AddChild(new LeafNode(token1));
				this.MoreFunctionParameters(node);
				parent.AddChild(node);
			}
			else
			{
				this.tokenList.Previous();
				this.tokenList.Previous();
				throw new Error("Se esperaba un identificador antes del token  " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}
		else if (token.code == this.lexCode.IDENTIFIER)
		{
			this.tokenList.Previous();
			throw new Error("El tipo " + token.value + " no es válido", token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);	
		}
		else
			this.tokenList.Previous();
	};

//	27.	<Más Parámetros Función> --> "," <Tipo> <Identificador> <Más Parámetros Función> | vacío
	this.MoreFunctionParameters = function(parent)
	{
		var node = new InternalNode("MoreFunctionParameters");
		var token = this.tokenList.Next();

		if (token.value == ",")
		{
			node.AddChild(new LeafNode(token));
			var token1 = this.tokenList.Next();

			if (token1.code == this.lexCode.TYPE)
			{
				node.AddChild(new LeafNode(token1));
				var token2 = this.tokenList.Next();

				if (token2.code == this.lexCode.IDENTIFIER)
				{
					node.AddChild(new LeafNode(token2));
					this.MoreFunctionParameters(node);
					parent.AddChild(node);
				}
				else 
				{
					this.tokenList.Previous();
					this.tokenList.Previous();
					this.tokenList.Previous();
					throw new Error("Se esperaba un identificador antes del token  " + token2.value, token2.line, token2.col, this.buildMessagesCtrl.errorType.ERROR);
				}
			}
			else
			{
				this.tokenList.Previous();
				this.tokenList.Previous();
				throw new Error("Se esperaba un parámetro antes del token  " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}
		else
			this.tokenList.Previous();
	};

//	28.	<Retorno Función> --> "return" <Expresión> ";" | vacío
	this.FunctionReturn = function(parent)
	{
		var node = new InternalNode("FunctionReturn");
		var token = this.tokenList.Next();

		if (token.value == "return")
		{
			node.AddChild(new LeafNode(token));

			if (this.Expression(node))
			{
				var token1 = this.tokenList.Next(node);
				if (token1.value == ";")
				{
					node.AddChild(new LeafNode(token1));
					parent.AddChild(node);

					return true;
				}
				else
				{
					this.tokenList.Previous();
					this.tokenList.Previous();
					throw new Error("Se esperaba ; antes del token  " + token1.value, token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
				}
			}
			else
			{
				this.tokenList.Previous();
				throw new Error("Se esperaba un valor de retorno después de return  " + token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}
		else
			this.tokenList.Previous();

		return false;
	};

//	29.	<Llamada Función> --> <Identificador> "(" <Argumentos Función > ")"
	this.FunctionCall = function(parent)
	{
		var node = new InternalNode("FunctionCall");
		var token = this.tokenList.Next();

		if (token.code == this.lexCode.IDENTIFIER || token.value == "main" || token.code == this.lexCode.SASM)
		{
			node.AddChild(new LeafNode(token));
			var token1 = this.tokenList.Next();

			if (token1.value == "(")
			{
				node.AddChild(new LeafNode(token1));
				this.FunctionArguments(node);
				var token2 = this.tokenList.Next();
				if (token2.value == ")")
				{
					node.AddChild(new LeafNode(token2));
					parent.AddChild(node);

					return true;
				}
				else
				{
					this.tokenList.Previous();
					this.tokenList.Previous();
					this.tokenList.Previous();
					throw new Error("Se esperaba ) antes del token  " + token2.value, token2.line, token2.col, this.buildMessagesCtrl.errorType.ERROR);	
				}				
			}
			else // se devuelven los tokens ya que un identificador suelto puede ser un factor de una expresión o una varialbe en declración.
			{
				this.tokenList.Previous(); // token1;
				this.tokenList.Previous(); // token

				return false;
			}
		}
		else
			this.tokenList.Previous();

		return false;
	};

//	30.	<Argumentos Función> --> <Expresión> <Más Argumentos> | vacío
	this.FunctionArguments = function(parent)
	{
		var node = new InternalNode("FunctionArguments");
		if (this.Expression(node))
		{
			this.MoreFunctionArguments(node);
			parent.AddChild(node);
		}
	};

//	31.	<Más Argumentos> --> "," <Expresión> <Más Argumentos> | vacío
	this.MoreFunctionArguments = function(parent)
	{
		var node = new InternalNode("MoreFunctionArguments");
		var token = this.tokenList.Next();

		if (token.value == ",")
		{
			node.AddChild(new LeafNode(token));
			if (this.Expression(node))
			{
				this.MoreFunctionArguments(node);
				parent.AddChild(node);
			}
			else
			{
				this.tokenList.Previous();
				throw new Error("Se esperaba un argumento después del token " + token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);	
			}				
		}
		else
			this.tokenList.Previous();
	};

/** Fin: Reglas para Funciones **/

/** Inicio: Reglas para Expresión **/

//	32.	<Expresión> --> <Expresión Relacional> <Más Expresiones Relacionales>
	this.Expression = function(parent)
	{
		var node = new InternalNode("Expression");

		if (this.RelationalExpression(node))
		{
			this.MoreRelationalExpressions(node); // vacío
			parent.AddChild(node);
			return true;
		}

		return false;
	};

//	33.	<Expresión Relacional> --> <Expresión Algebraica> <Más Expresiones Algebraicas>
	this.RelationalExpression = function(parent)
	{
		var node = new InternalNode("RelationalExpression");

		if (this.AlgebraicExpression(node))
		{
			this.MoreAlgebraicExpressions(node);
			parent.AddChild(node);

			return true;
		}
		else
			return false;
	};

//	34.	<Más Expresiones Relacionales> --> <Operador Lógico> <Expresión Relacional> <Más Expresiones Relacionales> | vacío
	this.MoreRelationalExpressions = function(parent)
	{
		var node = new InternalNode("MoreRelationalExpressions");
		var token = this.tokenList.Next();

		if (token.code == this.lexCode.LOGIC_OPERATOR)
		{
			node.AddChild(new LeafNode(token));
			if (this.RelationalExpression(node))
			{
				this.MoreRelationalExpressions(node);
				parent.AddChild(node);
			}
			else
			{
				this.tokenList.Previous();
				throw new Error("Se esperaba una expresión después del operador " + token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}
		else 
			this.tokenList.Previous();
	};

//	35.	<Expresión Algebraica> --> <Término> <Más Términos>
	this.AlgebraicExpression = function(parent)
	{
		var node = new InternalNode("AlgebraicExpression");

		if (this.Term(node))
		{
			this.MoreTerms(node);
			parent.AddChild(node);

			return true;
		}
		else
			return false;
	};

//	36.	<Más Expresiones Algebraicas> --> <Operador Relacional> <Expresión Algebraica> <Más Expresiones Algebraicas> | vacío
	this.MoreAlgebraicExpressions = function(parent)
	{
		var node = new InternalNode("MoreAlgebraicExpressions");

		var token = this.tokenList.Next();
		if (token.code == this.lexCode.RELATIONAL_OPERATOR)
		{
			node.AddChild(new LeafNode(token));

			if (this.AlgebraicExpression(node))
			{
				this.MoreAlgebraicExpressions(node);
				parent.AddChild(node);
			}
			else
			{
				this.tokenList.Previous();
				throw new Error("Se esperaba una expresión después del operador " + token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);		
			}		
		}
		else
			this.tokenList.Previous();
	};

//	37.	<Término> --> <Factor> <Más Factores> | <Operador Aditivo> <Factor> <Más Factores>
	this.Term = function(parent)
	{
		var node = new InternalNode("Term");
		var token = this.tokenList.Next();

		if (token.code == this.lexCode.ADDITIVE_OPERATOR)
		{
			node.AddChild(new LeafNode(token));
		}
		else 
			this.tokenList.Previous();


		if (this.Factor(node))
		{
			this.MoreFactors(node);
			parent.AddChild(node);

			return true;
		}

		return false;
	};


//	38.	<Más Términos> --> <Operador Aditivo> <Término> <Más Términos> | vacío
	this.MoreTerms = function(parent)
	{
		var node = new InternalNode("MoreTerms");

		var token = this.tokenList.Next();
		if (token.code == this.lexCode.ADDITIVE_OPERATOR)
		{
			node.AddChild(new LeafNode(token));
			if (this.Term(node))
			{
				this.MoreTerms(node);
				parent.AddChild(node);
			}
			else
			{
				this.tokenList.Previous();
				throw new Error("Se esperaba un término para la expresión después del operador " + token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);		
			}					
		}
		else
			this.tokenList.Previous();	
	};

//	39.	<Factor> --> <Identificador> | <Constante Entera> | <Constante Flotante> | <Cadena> | <Carácter> | "!" <Factor> | <Llamada Función> | <Incremento> | "(" <Expresión> ")" | true | false
	this.Factor = function(parent)
	{
		var node = new InternalNode("Factor");

		if (this.Increment(node) || this.FunctionCall(node)) // deben evaluarse antes para evitar ambiguedad.
		{
			parent.AddChild(node);

			return true;
		}
	
		var token = this.tokenList.Next();

		switch (token.code)
		{
			case this.lexCode.IDENTIFIER:
			case this.lexCode.INTEGER_CONSTANT:
			case this.lexCode.FLOAT_CONSTANT:
			case this.lexCode.STRING:
			case this.lexCode.CHAR_CONSTANT:
			case this.lexCode.BOOLEAN:
				node.AddChild(new LeafNode(token));
				parent.AddChild(node);
				return true;
			break;
		}

		// "!" <Factor>
		if (token.value == "!")
		{
			node.AddChild(new LeafNode(token));
			if (this.Factor(node))
			{
				parent.AddChild(node);
				return true;
			}
			else
			{
				this.tokenList.Previous();
				throw new Error("Se esperaba un factor/expresión después del operador de negación !", token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);	
			}						
		}

		// "(" <Expresión> ")"
		if (token.value == "(")
		{
			node.AddChild(new LeafNode(token));
			if (this.Expression(node))
			{
				var token1 = this.tokenList.Next();
				if (token1.value == ")")
				{
					node.AddChild(new LeafNode(token1));
					parent.AddChild(node);
					return true;
				}
				else
				{
					this.tokenList.Previous();
					this.tokenList.Previous();
					throw new Error("Se esperaba terminar la expresión con el token ) ", token1.line, token1.col, this.buildMessagesCtrl.errorType.ERROR);
				}
			}
			else
			{
				this.tokenList.Previous();
				throw new Error("Se esperaba una expresión después del token (", token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);		
			}					
		}

		this.tokenList.Previous();

		return false;
	};

//	40.	<Más Factores> --> <Operador Multiplicativo> <Factor> <Más Factores> | Vacío
	this.MoreFactors = function(parent)
	{
		var node = new InternalNode("MoreFactors");
		var token = this.tokenList.Next();

		if (token.code == this.lexCode.MULTIPLICATIVE_OPERATOR)
		{
			node.AddChild(new LeafNode(token));
			if (this.Factor(node))
			{
				this.MoreFactors(node);
				parent.AddChild(node);
			}
			else
			{
				this.tokenList.Previous();
				throw new Error("Se esperaba un factor después del operador "+token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
			}
		}
		else
			this.tokenList.Previous();
	};

//	41.	<Incremento> --> <Identificador> <Operador Incremento> | <Operador Incremento> <Identificador>
	this.Increment = function(parent)
	{
		var node = new InternalNode("Increment");
		var token = this.tokenList.Next();

		// <Identificador>++ | <Identificador>-- 
		if (token.code == this.lexCode.IDENTIFIER)
		{
			node.AddChild(new LeafNode(token));
			var token1 = this.tokenList.Next();	

			if (token1.code == this.lexCode.INCREMENT_OPERATOR)
			{
				node.AddChild(new LeafNode(token1));
				parent.AddChild(node);

				return true;
			}		
			this.tokenList.Previous(); // token1
			this.tokenList.Previous(); // token
			return false; // no se genera error porque sería una ambiguedad porque un identificador suelto tiene varios usos.
		}

		if (token.code == this.lexCode.INCREMENT_OPERATOR)
		{
			node.AddChild(new LeafNode(token));
			var token2 = this.tokenList.Next();

			if (token2.code == this.lexCode.IDENTIFIER)
			{
				node.AddChild(new LeafNode(token2));
				parent.AddChild(node);
				return true;
			}
			else
			{
				this.tokenList.Previous();
				this.tokenList.Previous();
				throw new Error("Se espera un identificador después del operador "+token.value, token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);			
			}			
			
			return false;
		}

		this.tokenList.Previous();

		return false;
	};

/** Fin: Reglas para Expresión **/

}

function RootNode(label)
{
	this.label = label;
	this.children = new Array();

	this.AddChild = function(child)
	{
		if (!(child instanceof InternalNode) && !(child instanceof LeafNode))
			throw "Nodo hijo debe ser un nodo intermedio o nodo hoja.";

		this.children.push(child);
	}
}	

function InternalNode(label)
{
	this.label = label;
	this.children = new Array();

	this.AddChild = function(child)
	{
		if (!(child instanceof InternalNode) && !(child instanceof LeafNode))
			throw "Nodo hijo debe ser un nodo intermedio o nodo hoja.";

		child.parent = this;
		this.children.push(child);
	}
}

function LeafNode(token)
{
	if (!(token instanceof Token))
		throw "El token no es una instancia del tipo Token";

	this.token = token;
	this.label = token.value;
}

