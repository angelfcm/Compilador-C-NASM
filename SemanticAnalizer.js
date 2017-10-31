/*
	Angel Fernando Carriola Monroy
*/
// Comprobación de:
// - Tipos
// - Flujo de control
// - Unicidad
// - Emparejamiento
// Las acciones semánticas son:
// - Sentencias de declaración.
// - Sentencias ejecutables.
// - Funciones y procedimientos.
// - Identificación de variables.
// - Etiquetas.
// - Constantes
// - Conversión y equivalencia de tipo.
// - Sobrecarga de operadores y funciones.

function SemanticAnalizer(tree, lexCode, buildMessagesCtrl)
{
	if (!(tree instanceof RootNode))
		throw "El árbol de derivación debe ser instancia de RootNode";

	if (!(buildMessagesCtrl instanceof BuildMessages))
		throw "El manejador de errores debe ser instancia de BuildMessages";

	this.variables = [];
	this.functions = [];
	this.globalContext = new Context(0);
	this.buildMessagesCtrl = buildMessagesCtrl;
	this.lexCode = lexCode;
	this.tree = tree;
	var currentFunctionReturnType = null; // ayuda a saber que tipo de dato debe retornar la función
	var currentVarInAssignment = null; // ayuda a saber qué variable está siendo asignada y aplicada para saber si se marca como usada o no.
	var currentLoop = null; // indentifica el for o while actual, sirve para saber si un break o continue está dentro de un búcle.
	var currentSwitch = null; // identifica el switch actual, sirve para saber si un break está dentro de un switch.
	var currentNasmLateIncrementVariable = null; // indica si hay una variable con incremento tardio, es decir donde el operador ++ o -- va después del identificador.
	var currentNasmLateIncrementOperation = null; // necesaria para llevar acabo la operación de incremento o decremento. 
	this.assemblerCode = "";
	this.nasmVariablesPrefix = "__ns__";
	this.assemblerCodeGlobalExpressions = ""; // debido a que nasm no puede ejecutar secciones de tipo .text fuera de CMAIN o una subrutina llamada por CMAIN, se guarda este código para al final meterlo al principio de CMAIN.
	var nasmLabelIdCounter = 0; // usado para nombre de manera única a cada etiqueta dentro del ensamblador
	var currentNasmLoopLabelId = null; // ayuda a colocar los identificadores de regreso para los búcles.
	var currentNasmLoopEndLabelId = null; // completanrio al anterior para cuando se haga un break sepa a donde ir
	this.success = false;

	this.Start = function()
	{
		this.success = false;
		this.variables = [];
		this.functions = [];
		this.assemblerCode = "";
		this.buildMessagesCtrl.AddCaption("Inicio del análisis semántico.");
		//this.Program(this.tree, this.globalContext);
		try
		{
			this.Program(this.tree, this.globalContext);
			this.success = true;
		}
		catch(error)
		{
			if (error instanceof Error)
				this.buildMessagesCtrl.AddError(error.message, error.line, error.col, error.type);
			else
				throw error;
		}

		for (var i = 0; i < this.variables.length; i++)
		{
			var variable = this.variables[i];
			if (variable.used == false)
			{
				if (variable.assigned)
					this.buildMessagesCtrl.AddError("La variable '" + variable.name + "' ha sido declarada y asignada pero nunca usada.", variable.line, variable.col, this.buildMessagesCtrl.errorType.WARNING);
				else
					this.buildMessagesCtrl.AddError("La variable '" + variable.name + "' ha sido declarada pero nunca usada.", variable.line, variable.col, this.buildMessagesCtrl.errorType.WARNING);
			}
		}
/*
		for (var i = 0; i < this.functions.length; i++)
		{
			var _function = this.functions[i];
			if (_function.used == false)
				this.buildMessagesCtrl.AddError("La función '" + _function.returnType + " " + _function.name + "(" + _function.signature + ")'' ha sido definida pero nunca llamada.", _function.line, _function.col, this.buildMessagesCtrl.errorType.WARNING);
		}
*/
		this.buildMessagesCtrl.AddCaption("Fin del análisis semántico.");
	}

	this.FindChild = function(node, childLabel)
	{
		for (var i = 0; i < node.children.length; i++)
		{
			if (node.children[i].label == childLabel)
			{
				return node.children[i];
			}
		}

		return null;
	}

	this.FindVariable = function(name, context)
	{
		if ( !(context instanceof Context) )
			throw "El contexto debe ser instancia de Context";

		for (var i = this.variables.length-1; i >= 0; i--) // empieza al revés para encontrar la variable más cercana al contexto requerido.
		{
			var variable = this.variables[i];
			if (variable.name == name && ( variable.context.level < context.level || variable.context.id == context.id) )
			{
				return variable;
			}
		}

		return null;
	}

	this.FindFunction = function(name, context, functionSignature)
	{
		if ( !(context instanceof Context) )
			throw "El contexto debe ser instancia de Context";

		for (var i = this.functions.length-1; i >= 0; i--) // empieza al revés para encontrar la variable más cercana al contexto requerido.
		{
			var _function = this.functions[i];
			if (_function.name == name && ( _function.context.level < context.level || _function.context.id == context.id) && (_function.signature == functionSignature || functionSignature == undefined) )
			{
				return _function;
			}
		}

		return null;
	}

	this.IsDataType = function(value)
	{
		switch(value)
		{
			case this.lexCode.INTEGER_CONSTANT:
			case this.lexCode.FLOAT_CONSTANT:
			case this.lexCode.CHAR_CONSTANT:
			case this.lexCode.STRING:
			case this.lexCode.BOOLEAN:
				return true;
				break;
		}

		return true;
	}	

	this.IsNumericType = function(type)
	{
		if (type == "float" || type == "int")
			return true;

		return false;
	}

	this.GetDataTypeName = function(lexCode)
	{
		switch(lexCode)
		{
			case this.lexCode.INTEGER_CONSTANT:
				return "int";
				break;
			case this.lexCode.FLOAT_CONSTANT:
				return "float";
				break;
			case this.lexCode.CHAR_CONSTANT:
				return "char";
				break;
			case this.lexCode.STRING:
				return "string";
				break;
			case this.lexCode.BOOLEAN:
				return "bool";
				break;
		}

		return "undefined";
	}

	this.cType2NasmType = function(cType)
	{
		var nasmType = "db";
		switch(cType)
		{
			case 'int':
			case 'float':
			case 'double':
				nasmType = "dd"
				break;
		}
		return nasmType;
	}

	this.GetNasmResType = function(nasmType)
	{
		var resType;
		switch(nasmType)
		{
			case 'db':
				resType = "resb";
				break;
			case 'dw':
				resType = "resw";
				break;
			case 'dd':
				resType = "resd";
				break;
			case 'dq':
				resType = "resq";
				break;
		}
		return resType;
	}
	this.GetNasmSizeIndicator = function(cType)
	{
		var indicator = "byte";
		switch(cType)
		{
			case 'int':
			case 'float':
			case 'double':
				indicator = "dword"
				break;
		}
		return indicator;		
	}

	this.GetTypeNumBytes = function(cType)
	{
		var numBytes = 1;
		switch(cType)
		{
			case 'int':
			case 'float':
			case 'double':
				numBytes = 4
				break;
		}
		return numBytes;	
	}

	this.GetNasmSuitableAx = function(numBytes)
	{
		var rax;
		switch(numBytes)
		{
			case 1:
				rax = "al";
				break;
			case 2:
				rax = "ax";
				break;
			case 4:
				rax = "eax"
				break;
			case 8:
				rax = "rax"
				break;
		}
		return rax;
	}

	this.UpdateLateIncrement = function()
	{
		if (currentNasmLateIncrementVariable != null) // si se utilizó el operador de incremento ++ o -- de lado derecho de un factor, aquí es cuando se aplica el efecto tardio, antes de ser operado por otro factor.
		{
			this.assemblerCode += currentNasmLateIncrementOperation + " " + this.GetNasmSizeIndicator(currentNasmLateIncrementVariable.type) + " [" + this.nasmVariablesPrefix + currentNasmLateIncrementVariable.name + currentNasmLateIncrementVariable.context.id + "]\n";
			currentNasmLateIncrementOperation = null;
			currentNasmLateIncrementVariable = null;
		}
	}

	this.SetSasmCode = function(context)
	{
		this.assemblerCode += this.nasmVariablesPrefix + "print_int" + context.id + ":\n\n"
		    +"section .bss\n"
		    +"value resd 1\n\n"
		    +"section .text\n"
		    +"mov eax, [esp+4]\n"
		    +"mov dword[value], eax\n"
		    +"mov eax, dword[value]\n"    
		    +"PRINT_DEC 4, eax\n\n"
			+"ret\n\n";

		var fprint = new Function("print_int", "void", context, "int", -1, -1);
		this.functions.push(fprint);

		this.assemblerCode += this.nasmVariablesPrefix + "newline" + context.id + ":\n"  
		    +"NEWLINE\n"
			+"ret\n\n";

		var fnewline = new Function("newline", "void", context, "", -1, -1);
		this.functions.push(fnewline);
	}

//	1.	<Programa> --> <Contenido Global> <Más Contenido Global>
	this.Program = function(node, context)
	{
		this.assemblerCode += "%include 'io.inc'\n\n";
			
		this.SetSasmCode(context);

		if (node.children[0])
			this.GlobalContent(node.children[0], context);

		if (node.children[1])
			this.MoreGlobalContent(node.children[1], context);

		// Mueve todo el contenido de tipo section .text al principio de la subrutina CMAIN para que pueda ser ejecutado.
		this.assemblerCode = this.assemblerCode.replace(/CMAIN:(\n)*((.|\n)*)ret/, "CMAIN:\n\n"+this.assemblerCodeGlobalExpressions + "$2ret");
	}

//	2.	<Contenido Global> --> <Declaración> ";" | <Función>
	this.GlobalContent = function(node, context)
	{
		var child = node.children[0];

		if (child.label == "Declaration")
			this.Declaration(child, context);
		else if (child.label == "Function")
			this.Function(child, context);
	}

//	3.	<Más Contenido Global> --> <Contenido Global> <Más Contenido Global> | vacío
	this.MoreGlobalContent = function(node, context)
	{
		var firstChild = node.children[0];

		if (firstChild)
		{
			this.GlobalContent(firstChild, context);
			if (node.children[1])
				this.MoreGlobalContent(node.children[1], context);
		}
	}

//	4.	<Bloque> --> "{" <Contenido Bloque> "}"
	this.Block = function(node, context)
	{
		if (node.children[1].label == "BlockContent")
			this.BlockContent(node.children[1], context);
	}

//	5.	<Contenido Bloque> --> <Sentencia> <Contenido Bloque> | <If> <Contenido Bloque> | <For> <Contenido Bloque> | <While> <Contenido Bloque> | <Switch> <Contenido Bloque> | <Retorno Función> <Contenido Bloque> | vacío
	this.BlockContent = function(node, context)
	{
		var firstChild = node.children[0];
		var blockContentNode = this.FindChild(node, "BlockContent");

		if (firstChild.label == "Sentence")
			this.Sentence(firstChild, context);
		else if (firstChild.label == "If")
			this.If(firstChild, context);
		else if (firstChild.label == "FunctionReturn")
			this.FunctionReturn(firstChild, context);
		else if (firstChild.label == "For")
			this.For(firstChild, context);
		else if (firstChild.label == "While")
			this.While(firstChild, context);

		if (blockContentNode)
			this.BlockContent(blockContentNode, context);

		if (currentFunctionReturnType != null) // si el retorno contiene un tipo es porque este bloque pertenece a una función y no se le asignó un retorno, no se considera un error según C pero se debe colocar algún valor de retorno por defecto, en caso de C suele devolver 1 para tipso int y char, pero como no puedo asegurar que esto siempre sea asi, yo decidiré devolver un 0 representando el NULL para cualquier tipo de dato
		{
			this.assemblerCode += "mov eax, 0\n";
		}
	}

//	6.	<Cuerpo Estructura> --> <Bloque> | <Sentencia> | ";"
	this.StructureBody = function(node, context)
	{
		var firstChild = node.children[0];

		switch (firstChild.label)
		{
			case "Block":
				this.Block(firstChild, context);
				break;
			case "Sentence":
				this.Sentence(firstChild, context);
				break;
		}
	}

//	7.	<Sentencia> --> <Declaración> ";" | <Asignación> ";" | <Expresión> ";" | "break" ";" | "continue" ";"
	this.Sentence = function(node, context)
	{
		var firstChild = node.children[0];

		switch (firstChild.label)
		{
			case "Declaration":
				this.Declaration(firstChild, context);
				break;
			case "Assignment":
				this.Assignment(firstChild, context);
				break;
			case "Expression":
				this.Expression(firstChild, context);
				break;
			case "break":
				if (!currentSwitch && !currentLoop)
					throw new Error("La sentencia break no está dentro de un búcle o switch.", firstChild.token.line, firstChild.token.col, this.buildMessagesCtrl.errorType.ERROR);
				this.assemblerCode += "jmp " + currentNasmLoopEndLabelId + "\n";
				break;
			case "continue":
				if (!currentLoop)
					throw new Error("La sentencia continue no está dentro de un búcle.", firstChild.token.line, firstChild.token.col, this.buildMessagesCtrl.errorType.ERROR);

				this.assemblerCode += "jmp " + currentNasmLoopLabelId + "\n";
				break;
		}
	}
	
//	8.	<Declaración> --> <Tipo> <Identificador> <Asignación Declaración> <Declaración Múltiple>
	this.Declaration = function(node, context)
	{
		var typeNode = node.children[0]; // nodo tipo
		var idNode = node.children[1]; // nodo identificador
		var type = typeNode.token.value;
		var name = idNode.token.value;
		var existingVariable = this.FindVariable(name, context);
		var existingFunction = this.FindFunction(name, context);

		if (existingFunction && existingFunction.context.level == context.level)
			throw new Error("La variable '" + name + "' ya ha sido definida como una función en este contexto.", idNode.token.line, idNode.token.col, this.buildMessagesCtrl.errorType.ERROR);

		if (existingVariable == null || existingVariable.context.id != context.id)
		{
			newvar = new Variable(name, type, context, idNode.token.line, idNode.token.col);
			this.variables.push(newvar);
		}
		else
			throw new Error("La variable '" + name + "' ya ha sido declarada en este contexto.", idNode.token.line, idNode.token.col, this.buildMessagesCtrl.errorType.ERROR);

		var assignmentStatementNode = this.FindChild(node, "AssignmentStatement");
		var multipleDeclarationNode = this.FindChild(node, "MultipleDeclaration");

		this.assemblerCode += "section .bss\n";
		this.assemblerCode += this.nasmVariablesPrefix + name + context.id + " ";
		var resType = this.GetNasmResType(this.cType2NasmType(type));
		var slots = 1; // como no manejamos vectores o matrices lo dejamos en 1 siempre.
		this.assemblerCode += resType + " " + slots + "\n\n";

		if (assignmentStatementNode)
		{
			var nasmPrevLength = this.assemblerCode.length;

			currentVarInAssignment = newvar;
			var expressionResult = this.AssignmentStatement(assignmentStatementNode, context);
			newvar.assigned = true;
			currentVarInAssignment = null;
			if ((!this.IsNumericType(expressionResult.type) || !this.IsNumericType(newvar.type)) && expressionResult.type != newvar.type)
				throw new Error("No se puede convertir el tipo " + expressionResult.type + " al tipo " + newvar.type + ".", expressionResult.line, expressionResult.col, this.buildMessagesCtrl.errorType.ERROR);	
		
			// Lo que hacemos aquí es quitar la parte de código que fue agregado en el proceso de la asignación para decidir si mantenerlo en su lugar o mandarlo a this.assemblerCodeGlobalExpressions, el cual al final será insertado dentro de CMAIN al principio.
			var nasmAddedCode = this.assemblerCode.substring(nasmPrevLength); // codigo agregado
			this.assemblerCode = this.assemblerCode.substring(0, nasmPrevLength); // codigo sin el codigo agregado

			if (expressionResult.type == "float" && newvar.type == "int") // convierte de tipo flotante al entero, eliminando la parte decimal.
			{
				nasmAddedCode += "mov ebx, " + Math.pow(10, expressionResult.floatDigits) + "\n";
				nasmAddedCode += "idiv ebx\n";
				expressionResult.floatDigits = 0;
			}
			var nasmRax = this.GetNasmSuitableAx(this.GetTypeNumBytes(type));
			nasmAddedCode += "mov " + this.GetNasmSizeIndicator(type) + "[" + this.nasmVariablesPrefix + name + context.id + "], " + nasmRax + "\n\n";
			// Si este código se encuentra en el contexto global, se guardará para al final introducirlo en el main pues nasm no puede ejecutar secciones de tipo .text fuera CMAIN o una subrutina llamada por CMAIN.
			if (context.level == 0)
				this.assemblerCodeGlobalExpressions += nasmAddedCode;
			else
				this.assemblerCode += nasmAddedCode;

			newvar.floatDigits = expressionResult.floatDigits;
		}

		if (multipleDeclarationNode)
			this.MultipleDeclaration(multipleDeclarationNode, context, newvar.type);
	}

//	9.	<Declaración Múltiple> --> "," <Identificador> <Asignación Declaración> <Declaración Múltiple> | vacío
	this.MultipleDeclaration = function(node, context, type)
	{
		var idNode = node.children[1]; // identificador
		var type = type;
		var name = idNode.token.value;
		var existingVariable = this.FindVariable(name, context);
		var existingFunction = this.FindFunction(name, context);

		if (existingFunction && existingFunction.context.level == context.level)
			throw new Error("La variable '" + name + "' ya ha sido definida como una función en este contexto.", idNode.token.line, idNode.token.col, this.buildMessagesCtrl.errorType.ERROR);

		if (existingVariable == null || existingVariable.context.id != context.id)
		{
			newvar = new Variable(name, type, context, idNode.token.line, idNode.token.col);
			this.variables.push(newvar);
		}
		else
			throw new Error("La variable '" + name + "' ya ha sido declarada en este contexto.", idNode.token.line, idNode.token.col, this.buildMessagesCtrl.errorType.ERROR);

		var assignmentStatementNode = this.FindChild(node, "AssignmentStatement");
		var multipleDeclarationNode = this.FindChild(node, "MultipleDeclaration");

		this.assemblerCode += "section .bss\n";
		this.assemblerCode += this.nasmVariablesPrefix + name + context.id + " ";
		var resType = this.GetNasmResType(this.cType2NasmType(type));
		var slots = 1; // como no manejamos vectores o matrices lo dejamos en 1.
		this.assemblerCode += resType + " " + slots + "\n\n";

		if (assignmentStatementNode)
		{
			var nasmPrevLength = this.assemblerCode.length;

			currentVarInAssignment = newvar;
			var expressionResult = this.AssignmentStatement(assignmentStatementNode, context);
			newvar.assigned = true;
			currentVarInAssignment = null;
			if ((!this.IsNumericType(expressionResult.type) || !this.IsNumericType(newvar.type)) && expressionResult.type != newvar.type)
				throw new Error("No se puede convertir el tipo " + expressionResult.type + " al tipo " + newvar.type + ".", expressionResult.line, expressionResult.col, this.buildMessagesCtrl.errorType.ERROR);	

			// Lo que hacemos aquí es quitar la parte de código que fue agregado en el proceso de la asignación para decidir si mantenerlo en su lugar o mandarlo a this.assemblerCodeGlobalExpressions, el cual al final será insertado dentro de CMAIN al principio.
			var nasmAddedCode = this.assemblerCode.substring(nasmPrevLength); // codigo agregado
			this.assemblerCode = this.assemblerCode.substring(0, nasmPrevLength); // codigo sin el codigo agregado

			if (expressionResult.type == "float" && newvar.type == "int") // convierte de tipo flotante al entero, eliminando la parte decimal.
			{
				nasmAddedCode += "mov ebx, " + Math.pow(10, expressionResult.floatDigits) + "\n";
				nasmAddedCode += "idiv ebx\n";
				expressionResult.floatDigits = 0;
			}
			var nasmRax = this.GetNasmSuitableAx(this.GetTypeNumBytes(type));
			nasmAddedCode += "mov " + this.GetNasmSizeIndicator(type) + "[" + this.nasmVariablesPrefix + name + context.id + "], " + nasmRax + "\n";
			// Si este código se encuentra en el contexto global, se guardará para al final introducirlo en el main pues nasm no puede ejecutar secciones de tipo .text fuera CMAIN o una subrutina llamada por CMAIN.
			if (context.level == 0)
				this.assemblerCodeGlobalExpressions += nasmAddedCode;
			else
				this.assemblerCode += nasmAddedCode;

			newvar.floatDigits = expressionResult.floatDigits;
		}
		
		if (multipleDeclarationNode)
			this.MultipleDeclaration(multipleDeclarationNode, context, newvar.type);
	}

//	10.	<Asignación Declaración> --> "=" <Expresión> | vacío
	this.AssignmentStatement = function(node, context)
	{
		return this.Expression(node.children[1], context);
	}

//	11.	<Asignación> --> <Identificador> "=" <Expresión>
	this.Assignment = function(node, context)
	{
		var identifierNode = node.children[0]; // identificador
		var name = identifierNode.token.value;
		var existingVariable = this.FindVariable(identifierNode.token.value, context);
		// Si no existe la variable no es posible realizar la asignación
		if (existingVariable == null)
			throw new Error("La variable '" + name + "' no existe en este contexto.", identifierNode.token.line, identifierNode.token.col, this.buildMessagesCtrl.errorType.ERROR);

		var nasmPrevLength = this.assemblerCode.length;

		currentVarInAssignment = existingVariable;
		var expressionResult = this.Expression(node.children[2], context);
		existingVariable.assigned = true;
		currentVarInAssignment = null;

		if ((!this.IsNumericType(expressionResult.type) || !this.IsNumericType(existingVariable.type))  && expressionResult.type != existingVariable.type)
			throw new Error("No se puede convertir el tipo " + expressionResult.type + " al tipo " + existingVariable.type + ".", expressionResult.line, expressionResult.col, this.buildMessagesCtrl.errorType.ERROR);	

		// Lo que hacemos aquí es quitar la parte de código que fue agregado en el proceso de la asignación para decidir si mantenerlo en su lugar o mandarlo a this.assemblerCodeGlobalExpressions, el cual al final será insertado dentro de CMAIN al principio.
		var nasmAddedCode = this.assemblerCode.substring(nasmPrevLength); // codigo agregado
		this.assemblerCode = this.assemblerCode.substring(0, nasmPrevLength); // codigo sin el codigo agregado

		if (expressionResult.type == "float" && existingVariable.type == "int") // convierte de tipo flotante al entero, eliminando la parte decimal.
		{
			nasmAddedCode += "mov ebx, " + Math.pow(10, expressionResult.floatDigits) + "\n";
			nasmAddedCode += "idiv ebx\n";
			expressionResult.floatDigits = 0;
		}

		var nasmRax = this.GetNasmSuitableAx(this.GetTypeNumBytes(existingVariable.type));
		nasmAddedCode += "section .text\n"
			+ "mov " + this.GetNasmSizeIndicator(existingVariable.type) + "[" + this.nasmVariablesPrefix + name +  existingVariable.context.id + "], " + nasmRax + "\n\n";	

		// Si este código se encuentra en el contexto global, se guardará para al final introducirlo en el main pues nasm no puede ejecutar secciones de tipo .text fuera CMAIN o una subrutina llamada por CMAIN.
		if (context.level == 0)
			this.assemblerCodeGlobalExpressions += nasmAddedCode;
		else
			this.assemblerCode += nasmAddedCode;

		existingVariable.floatDigits = expressionResult.floatDigits;
	}

//	12.	<If> --> "if (" <Expresión> ")" <Cuerpo Estructura> <Else>
	this.If = function(node, context)
	{
		var expressionNode = this.FindChild(node, "Expression");
		var structureBodyNode = this.FindChild(node, "StructureBody");
		var elseNode = this.FindChild(node, "Else");
		var context = new Context(context.level + 1);

		var labelId = nasmLabelIdCounter++;
		if (expressionNode)
		{
			this.Expression(expressionNode, context);

			this.assemblerCode += "section .text\n"
				+ "cmp eax, 1\n"
				+ "jne else" + labelId + "\n"
				+ "if" + labelId + ":\n";
		}

		if (structureBodyNode)
			this.StructureBody(structureBodyNode, context);

		this.assemblerCode += "jmp endif" + labelId + "\n";
		this.assemblerCode += "else" + labelId + ":\n";

		if (elseNode)
			this.Else(elseNode, context, "endif" + labelId);


		this.assemblerCode += "endif" + labelId + ":\n\n";
	}

//	13.	<Else> --> "else if (" <Expresión> ")" <CuerpoEstructura> <Else> | "else" <Cuerpo Estructura> | <vacío>
	this.Else = function(node, context, endifid)
	{
		var expressionNode = this.FindChild(node, "Expression");
		var structureBodyNode = this.FindChild(node, "StructureBody");
		var elseNode = this.FindChild(node, "Else");
		var context = new Context(context.level + 1);

		var labelId = nasmLabelIdCounter++;
		if (expressionNode)
		{
			this.Expression(expressionNode, context);

			this.assemblerCode += "section .text\n"
				+ "cmp eax, 1\n"
				+ "jne else" + labelId + "\n"
				+ "if" + labelId + ":\n";
		}

		if (structureBodyNode)
			this.StructureBody(structureBodyNode, context);

		this.assemblerCode += "jmp " + endifid + "\n"; // brinca al endif creado al final del if principal
		this.assemblerCode += "else" + labelId + ":\n";

		if (elseNode)
			this.Else(elseNode, context, endifid);	
	}

/** Inicio: Reglas para FOR **/

//	14.	<For> --> "For (" <Control Variable For> ";" <Control Condicional For> ";" <Incremento For> ")" <Cuerpo Estructura>
	this.For = function(node, context)
	{
		var forVariableControlNode = this.FindChild(node, "ForVariableControl");
		var forConditionalControlNode = this.FindChild(node, "ForConditionalControl");
		var forIncrementNode = this.FindChild(node, "ForIncrement");
		var structureBodyNode = this.FindChild(node, "StructureBody");
		var context = new Context(context.level+1);
		var labelId = nasmLabelIdCounter++;

		if (forVariableControlNode)
			this.ForVariableControl(forVariableControlNode, context);

		this.assemblerCode += "for" + labelId + ":\n";

		if (forConditionalControlNode)
			this.ForConditionalControl(forConditionalControlNode,context);

		this.assemblerCode += "cmp eax, 1\n"
			+ "jne endfor" + labelId + "\n";

		var parentLoop = currentLoop; // en caso de que sea un búcle dentro de otro.
		currentLoop = node;
		currentNasmLoopLabelId = "for" + labelId;
		currentNasmLoopEndLabelId = "endfor" + labelId;
		this.StructureBody(structureBodyNode, context);
		currentNasmLoopLabelId = null;
		currentNasmLoopEndLabelId = null;
		currentLoop = parentLoop; // regresa al bucle superior en caso de estar anidado

		if (forIncrementNode) // debido a que la actualización del for se hace después de cada ciclo, fue necesario cambiar un poco el orden conforme a la regla gramatical para que pueda efectuarse correctamente esta actualización.
			this.ForIncrement(forIncrementNode, context);

		this.assemblerCode +=  "jmp for" + labelId + "\n"
			+ "endfor" + labelId + ":\n\n";
	}

//	15.	<Control Variable For> --> <Declaración> | <Asignación> | vacío
	this.ForVariableControl = function(node, context)
	{
		var declarationNode = this.FindChild(node, "Declaration");
		var assignmentNode = this.FindChild(node, "Assignment");

		if (declarationNode)
			this.Declaration(declarationNode, context);
		else if (assignmentNode)
			this.Assignment(assignmentNode, context);
	}

//	16.	<Control Condicional For> --> <Expresión> | vacío
	this.ForConditionalControl = function(node, context)
	{
		var expressionNode = this.FindChild(node, "Expression");

		if (expressionNode)
			this.Expression(expressionNode, context);
	}

//	17.	<Incremento For> --> <Expresión> | <Asignación> | vacío
	this.ForIncrement = function(node, context)
	{
		var expressionNode = this.FindChild(node, "Expression");
		var assignmentNode = this.FindChild(node, "Assignment");

		if (expressionNode)
			this.Expression(expressionNode, context);
		else if (assignmentNode)
			this.Assignment(assignmentNode, context);
	}

/** Fin: Reglas para FOR **/

//	18.	<While> --> "while (" <Expresión> ")" <Cuerpo Estructura>
	this.While = function(node, context)
	{
		var expressionNode = this.FindChild(node, "Expression");
		var structureBodyNode = this.FindChild(node, "StructureBody");
		var context = new Context(context.level+1);

		var labelId = nasmLabelIdCounter++;

		this.assemblerCode += "while" + labelId + ":\n";

		this.Expression(expressionNode, context);

		this.assemblerCode += "cmp eax, 1\n"
			+ "jne endwhile" + labelId + "\n";

		var parentLoop = currentLoop; // en caso de que sea un búcle dentro de otro.
		currentLoop = node;
		currentNasmLoopLabelId = "while" + labelId;
		currentNasmLoopEndLabelId = "endwhile" + labelId;
		this.StructureBody(structureBodyNode, context);
		currentNasmLoopLabelId = null;
		currentNasmLoopEndLabelId = null;
		currentLoop = parentLoop; // regresa al bucle superior en caso de estar anidado

		this.assemblerCode += "jmp while" + labelId + "\n"
			+ "endwhile" + labelId + "\n";
	}

//	25.	<Función> --> <Tipo> <Identificador> "(" <Parámetro Función> ")" <Bloque>
	this.Function = function(node, context)
	{
		var functionParameterNode = this.FindChild(node, "FunctionParameter");
		var blockNode = this.FindChild(node, "Block");
		var identifierToken = node.children[1].token;
		var returnType = node.children[0].token.value;
		var name = identifierToken.value;
		var functionSignature = "";
		var	innerContext = new Context(context.level+1);

		// Se crea el código ensamblador para la función antes de los parámetros para que estos queden dentro de la función (no importa si quedan afuera pero espara estética).
		this.assemblerCode += "section .text\n";
		if (name == "main")
			this.assemblerCode += "global CMAIN\n\n"
				+"CMAIN:\n\n"; 
		else
			this.assemblerCode += this.nasmVariablesPrefix + name + context.id + ":\n\n";

		// Esto es para respaldar el valor de ebx para que pueda ser utilziada en la subritina y finalmente devolverle el valor original ya que ebx puede ser el segundo operando de un contexto inferior y solo se puede cambiar el valor de eax permanentemente ya que este siempre será el resultado de cualquier operación.
		this.assemblerCode += "mov ebp, esp\n"
			+	"push ebx\n";

		if (functionParameterNode) 
			functionSignature = this.FunctionParameter(functionParameterNode, innerContext);

		var existingFunction = this.FindFunction(name, context, functionSignature);

		if (existingFunction == null)
		{
			var existingVariable = this.FindVariable(name, context);

			if (existingVariable)
				throw new Error("La función '" + returnType + " " + name + "(" + functionSignature + ")' ya ha sido declarada como una variable en este contexto.", identifierToken.line, identifierToken.col, this.buildMessagesCtrl.errorType.ERROR);

			newfunction = new Function(name, returnType, context, functionSignature, identifierToken.line, identifierToken.col);
			this.functions.push(newfunction);
		}
		else if (existingFunction.returnType == returnType)
			throw new Error("La función '" + returnType + " " + name + "(" + functionSignature + ")' ya ha sido definida en este contexto.", identifierToken.line, identifierToken.col, this.buildMessagesCtrl.errorType.ERROR);
		else
			throw new Error("Existe ambiguedad entre la definición '" + returnType + " " + name + "(" + functionSignature + ")' y '" + existingFunction.returnType + " " + existingFunction.name + "(" + existingFunction.signature + ")'", identifierToken.line, identifierToken.col, this.buildMessagesCtrl.errorType.ERROR);

		currentFunctionReturnType = returnType;
		this.Block(blockNode, innerContext); // dentro de aquí debe de ponerse currentFunctionReturnType como nulo ya sea en FunctionReturn() o si no en Block()

		this.assemblerCode += "pop ebx\n"; // devuelve el valor inicial de ebx antes de llamar a la subrutina.
		this.assemblerCode += "\nret\n\n";
	}

//	26.	<Parámetro Función> --> <Tipo> <Identificador> <Más Parámetros Función> | vacío
	this.FunctionParameter = function(node, context)
	{
		var typeToken = node.children[0].token;
		var identifierToken = node.children[1].token;
		var moreFunctionParametersNode = this.FindChild(node, "MoreFunctionParameters");
		var newvar = new Variable(identifierToken.value, typeToken.value, context, identifierToken.line, identifierToken.col);
		var functionSignature = typeToken.value; // consiste en unir con comas los tipos de los parámetros.

		this.variables.push(newvar);
		newvar.used = true; // como es un parámetrolo dejamos así
		var paramPos = functionSignature.split(",").length-1; 

		if (moreFunctionParametersNode)
			functionSignature = this.MoreFunctionParameters(moreFunctionParametersNode, context, functionSignature);

 		// la lectura debe ser inversa pues el último elemento de la pila es el primero.
		this.assemblerCode += "section .bss\n";
		this.assemblerCode += this.nasmVariablesPrefix + newvar.name + context.id + " " + this.GetNasmResType(this.cType2NasmType(newvar.type)) + " 1\n";
		var numParams = functionSignature.split(",").length; // necesitamos saber que posición tiene el parámetro, siendo el primer parámetro el número 0 Esta es la forma más fácil para no hacer más modificaciones. Se multiplica por dos ya que cada parámetro en realidad son dos datos  de 16 bits.
		
		// Debido a que no se puede extraer los elementos de la pila usando pop porque que la misma llamada a la función agrega un dato a la pila para saber como regresar al terminar la subrutina, se utilizará el acceso a la pila mediante su apuntador "esp" el cuál está desplazado 4 bytes por el dato que tiene la dirección de regreso.
		this.assemblerCode += "section .text\n"
			+ "mov eax, [ebp+" + (4 + (numParams-1-paramPos) * 4) + "]\n"; // en este momento se ha reconstruido el dato de 32 bits que estaba dividido en dos partes de 16 bits (parte alta y parte baja).
			// NOTA: se usa ebp en vez de esp ya que esp es movido al hacer push ebx para respaldar el dato y devolverlo al final mientras se hacen las operaciones, por lo que ebp es una copia de esp antes de que la pila sea desplazada después de entrar a la subrutina.
		switch(this.GetTypeNumBytes(newvar.type))
		{
			case 1:
				this.assemblerCode += "mov byte[" + this.nasmVariablesPrefix + newvar.name + context.id + "], al\n";
				break;
			case 2:
				this.assemblerCode += "mov word[" + this.nasmVariablesPrefix + newvar.name + context.id + "], ax\n";
				break;
			case 4:
				this.assemblerCode += "mov dword[" + this.nasmVariablesPrefix + newvar.name + context.id + "], eax\n";
				break;				
		}

		this.assemblerCode += "\n";

		return functionSignature;
	}

//	27.	<Más Parámetros Función> --> "," <Tipo> <Identificador> <Más Parámetros Función> | vacío 
	this.MoreFunctionParameters = function(node, context, functionSignature)
	{
		var typeToken = node.children[1].token;
		var identifierToken = node.children[2].token;
		var newvar = new Variable(identifierToken.value, typeToken.value, context, identifierToken.line, identifierToken.col);
		var moreFunctionParametersNode = this.FindChild(node, "MoreFunctionParameters");
		
		functionSignature += ", " + typeToken.value;
		this.variables.push(newvar);
		newvar.used = true; // como es un parámetrolo dejamos así
		var paramPos = functionSignature.split(",").length-1; 

		if (node.children[3])
			functionSignature = this.MoreFunctionParameters(moreFunctionParametersNode, context, functionSignature);

		// la lectura debe ser inversa pues el último elemento de la pila es el primero.
		this.assemblerCode += "section .bss\n";
		this.assemblerCode += this.nasmVariablesPrefix + newvar.name + context.id + " " + this.GetNasmResType(this.cType2NasmType(newvar.type)) + " 1\n";
		var numParams = functionSignature.split(",").length; // necesitamos saber que posición tiene el parámetro, siendo el primer parámetro el número 0 Esta es la forma más fácil para no hacer más modificaciones. Se multiplica por dos ya que cada parámetro en realidad son dos datos  de 16 bits.
		
		// Debido a que no se puede extraer los elementos de la pila usando pop porque que la misma llamada a la función agrega un dato a la pila para saber como regresar al terminar la subrutina, se utilizará el acceso a la pila mediante su apuntador "esp" el cuál está desplazado 4 bytes por el dato que tiene la dirección de regreso.
		this.assemblerCode += "section .text\n"
			+ "mov eax, [ebp+" + (4 + (numParams-1-paramPos) * 4) + "]\n"; // en este momento se ha reconstruido el dato de 32 bits que estaba dividido en dos partes de 16 bits (parte alta y parte baja).

		switch(this.GetTypeNumBytes(newvar.type))
		{
			case 1:
				this.assemblerCode += "mov byte[" + this.nasmVariablesPrefix + newvar.name + context.id + "], al\n";
				break;
			case 2:
				this.assemblerCode += "mov word[" + this.nasmVariablesPrefix + newvar.name + context.id + "], ax\n";
				break;
			case 4:
				this.assemblerCode += "mov dword[" + this.nasmVariablesPrefix + newvar.name + context.id + "], eax\n";
				break;					
		}

		return functionSignature;
	}

//	28.	<Retorno Función> --> "return" <Expresión> ";" | vacío
	this.FunctionReturn = function(node, context)
	{
		var expressionResult = this.Expression(node.children[1], context); // aquí eax será el valor del retorno el cuál será capturado cuando se haga una llamada a la función.

		if ( (!this.IsNumericType(expressionResult.type)  || !this.IsNumericType(currentFunctionReturnType)) && expressionResult.type != currentFunctionReturnType) 
			throw new Error("No se puede convertir " + expressionResult.type + " a " + currentFunctionReturnType + " en el retorno de función.", expressionResult.line, expressionResult.col, this.buildMessagesCtrl.errorType.ERROR);
	
		currentFunctionReturnType = null;
	}

// 	29.	<Llamada Función> --> <Identificador> "(" <Argumentos Función > ")"
	this.FunctionCall = function(node, context)
	{
		var identifierToken = node.children[0].token;
		var functionArgumentsNode = this.FindChild(node, "FunctionArguments");
		var functionSignature = "";
		var name = identifierToken.value;

		if (functionArgumentsNode)
			functionSignature = this.FunctionArguments(functionArgumentsNode, context);

		var existingVariable = this.FindVariable(name, context);
		var existingFunction = this.FindFunction(name, context, functionSignature);

		if (existingFunction == null)
			throw new Error("No se encuentra una función que coincida con la llamada '" + name + "(" + functionSignature + ")'", identifierToken.line, identifierToken.col, this.buildMessagesCtrl.errorType.ERROR);

		// Esto puede suceder cuándo una variable ha sido declara en un contexto inferior al contexto de una función de contexto global y por tanto la función no podría ser usada si hay una variable de contexto mayor.
		if (existingVariable && existingVariable.context.level > existingFunction.context.level)
			throw new Error("'" + name + "' no puede ser usada como una función", identifierToken.line, identifierToken.col, this.buildMessagesCtrl.errorType.ERROR);

		var expressionResult = new ExpressionResult(existingFunction.returnType, identifierToken.line, identifierToken.col);


		this.assemblerCode += "call " + this.nasmVariablesPrefix + name + existingFunction.context.id + "\n"; // se hace la llamada después de haber apilado los argumentos y después de ser llamada eax deberá contener el valor del retorno.
		// dado que la llamada genera inserciones de datos en la pila para poder enviar los parámetros, es necesario limpiarla a partir de este momento.
		var numParams = functionSignature == "" ? 0 : functionSignature.split(",").length; // forma rápida de saber cuantos parámetros fueron agregados.
		this.assemblerCode += "add esp, " + (numParams*2*2) + "\n\n"; // para no usar pop simplemente le sumamos la cantidad de bytes usados para los parámetros donde es la cantidad de parámetros por 2 bytes de cada uno por 2 porque se usaron 2 datos de 16 bits para poder pasar cada parámetro de 32 bits a la pila.

		return expressionResult;
	}

//	30.	<Argumentos Función> --> <Expresión> <Más Argumentos> | vacío
	this.FunctionArguments = function(node, context)
	{
		var expressionResult = this.Expression(node.children[0], context);
		var functionSignature = expressionResult.type;

		this.assemblerCode += "push eax\n";

		if (node.children[1])
			functionSignature = this.MoreFunctionArguments(node.children[1], context, functionSignature);

		return functionSignature;
	}

//	31.	<Más Argumentos> --> "," <Expresión> <Más Argumentos> | vacío
	this.MoreFunctionArguments  = function(node, context, functionSignature)
	{
		var expressionResult = this.Expression(node.children[1], context);
		functionSignature += ", " + expressionResult.type;

		this.assemblerCode += "push eax\n";

		if (node.children[2])
			functionSignature = this.MoreFunctionArguments(node.children[2], context, functionSignature);

		return functionSignature;
	}

//	32.	<Expresión> --> <Expresión Relacional> <Más Expresiones Relacionales>
	this.Expression = function(node, context)
	{
		this.assemblerCode += "section .text\n";
		var expressionResult = this.RelationalExpression(node.children[0], context);
		if (node.children[1])
			expressionResult = this.MoreRelationalExpressions(node.children[1], context, expressionResult);
		this.UpdateLateIncrement();

		return expressionResult;
	}

// 33.	<Expresión Relacional> --> <Expresión Algebraica> <Más Expresiones Algebraicas>
	this.RelationalExpression = function(node, context)
	{
		var expressionResult = this.AlgebraicExpression(node.children[0], context);

		if (currentNasmLateIncrementVariable != null) // si se utilizó el operador de incremento ++ o -- de lado derecho de un factor, aquí es cuando se aplica el efecto tardio, antes de ser operado por otro factor.
		{
			this.assemblerCode += currentNasmLateIncrementOperation + " " + this.GetNasmSizeIndicator(currentNasmLateIncrementVariable.type) + " [" + this.nasmVariablesPrefix + currentNasmLateIncrementVariable.name + currentNasmLateIncrementVariable.context.id + "]\n";
			currentNasmLateIncrementOperation = null;
			currentNasmLateIncrementVariable = null;
		}

		if (node.children[1])
			expressionResult = this.MoreAlgebraicExpressions(node.children[1], context, expressionResult);

		return expressionResult;
	}

//	34.	<Más Expresiones Relacionales> --> <Operador Lógico> <Expresión Relacional> <Más Expresiones Relacionales> | vacío
	this.MoreRelationalExpressions = function(node, context, leftOperand)
	{
		var logicOperatorNode = node.children[0];
		var expressionResult = new ExpressionResult("bool", leftOperand.line, leftOperand.col);

		this.assemblerCode += "mov ebx, eax\n"; // guarda el operando izquierdo en ebx antes de ser modificado por la sig. instrucción.
		var rightOperand = this.RelationalExpression(node.children[1], context); // eax debe ser el operando derecho
		this.assemblerCode += "xchg eax, ebx\n"; // intercambia los valores para mantener a eax como operando izquierdo y a ebx como operando derecho.
		var nasmOperation = logicOperatorNode.label == "&&" ? "AND" : "OR";
		this.assemblerCode += nasmOperation + " eax, ebx\n";

		this.UpdateLateIncrement();
		
		if (node.children[2])
			expressionResult = this.MoreRelationalExpressions(node.children[2], context, expressionResult);

		return expressionResult;
	}

//	35.	<Expresión Algebraica> --> <Término> <Más Términos>
	this.AlgebraicExpression = function(node, context)
	{
		var expressionResult = this.Term(node.children[0], context);

		if (node.children[1])
			expressionResult = this.MoreTerms(node.children[1], context, expressionResult);

		return expressionResult;
	}

//	36.	<Más Expresiones Algebraicas> --> <Operador Relacional> <Expresión Algebraica> <Más Expresiones Algebraicas> | vacío
	this.MoreAlgebraicExpressions = function(node, context, leftOperand)
	{
		var relationalOperator = node.children[0].token.value;
		var expressionResult = new ExpressionResult("bool", leftOperand.line, leftOperand.col);

		this.assemblerCode += "mov ebx, eax\n"; // guarda el operando izquierdo en ebx antes de ser modificado por la sig. instrucción.
		var rightOperand = this.AlgebraicExpression(node.children[1], context);	
		this.assemblerCode += "xchg eax, ebx\n"; // intercambia los valores para mantener a eax como operando izquierdo y a ebx como operando derecho.
		var nasmOperation;
		switch(relationalOperator)
		{
			case '>':
				nasmOperation = "jg";
				break;
			case '>=':
				nasmOperation = "jge";
				break;
			case '<':
				nasmOperation = "jl";
				break;
			case '<=':
				nasmOperation = "jle";
				break;
			case '==':
				nasmOperation = "je";
				break;
			case '!=':
				nasmOperation = "jne";
				break;
		}

		nasmLabelIdCounter++;
		this.assemblerCode += "cmp eax, ebx\n";
		this.assemblerCode += nasmOperation + " trueCmp" + nasmLabelIdCounter + "\n";
		this.assemblerCode += "jmp falseCmp" + nasmLabelIdCounter + "\n";
		this.assemblerCode += "trueCmp" + nasmLabelIdCounter + ":\n";
		this.assemblerCode += "mov eax, 1\n";
		this.assemblerCode += "jmp endCmp" + nasmLabelIdCounter + "\n";
		this.assemblerCode += "falseCmp" + nasmLabelIdCounter + ":\n";
		this.assemblerCode += "mov eax, 0\n";
		this.assemblerCode += "endCmp" + nasmLabelIdCounter+ ":\n";

		if (relationalOperator != "==" && relationalOperator != "!=" && (!this.IsNumericType(leftOperand.type) || !this.IsNumericType(rightOperand.type)) )
			throw new Error("Comparación inválida entre tipos " + leftOperand.type + " y " + rightOperand.type, expressionResult.line, expressionResult.col, this.buildMessagesCtrl.errorType.ERROR);	

		this.UpdateLateIncrement();

		if (node.children[2])
			expressionResult = this.MoreAlgebraicExpressions(node.children[2], context, expressionResult);

		return expressionResult;
	}

//	37.	<Término> --> <Factor> <Más Factores> | <Operador Aditivo> <Factor> <Más Factores>
	this.Term = function(node, context)
	{
		var factorNode = this.FindChild(node, "Factor");
		var moreFactorsNode = this.FindChild(node, "MoreFactors");
		var isNegative = node.children[0].label == "-" ? true : false;

		var expressionResult = this.Factor(factorNode, context);

		if (isNegative)
			this.assemblerCode += "neg eax\n";

		if (moreFactorsNode)
			expressionResult = this.MoreFactors(moreFactorsNode, context, expressionResult);

		return expressionResult;
	}

//	38.	<Más Términos> --> <Operador Aditivo> <Término> <Más Términos> | vacío
	this.MoreTerms = function(node, context, leftOperand)
	{
		var additiveOperator = node.children[0].token.value;
		var expressionResult = new ExpressionResult("int", leftOperand.line, leftOperand.col);

		this.assemblerCode += "mov ebx, eax\n"; // guarda el operando izquierdo en ebx antes de ser modificado por la sig. instrucción.
		var rightOperand = this.Term(node.children[1], context);
		this.assemblerCode += "xchg eax, ebx\n"; // intercambia los valores para mantener a eax como operando izquierdo y a ebx como operando derecho.
		

		if (!this.IsNumericType(leftOperand.type))
			throw new Error("El tipo de operando izquierdo es inválido para el operador " + additiveOperator, leftOperand.line, leftOperand.col, this.buildMessagesCtrl.errorType.ERROR);	
		else if (!this.IsNumericType(rightOperand.type))
			throw new Error("El tipo del operando derecho es inválido para el operador " + additiveOperator, rightOperand.line, rightOperand.col, this.buildMessagesCtrl.errorType.ERROR);		
		else 
		{
			if (leftOperand.type == rightOperand.type)
				expressionResult.type = leftOperand.type;
			else if (leftOperand.type == "float" || rightOperand.type == "float")
				expressionResult.type = "float";
		}
		// A continuación se obtiene el operando con mayor digitos y esa cantidad se considera para que el operando con menores digitos se multiplique por 10 a la cantidad de digitos que le faltan para alcanzar a los del otro operando.
		expressionResult.floatDigits = Math.max(leftOperand.floatDigits, rightOperand.floatDigits);
		var x10nLeftO =  expressionResult.floatDigits - leftOperand.floatDigits;
		var x10nRighttO = expressionResult.floatDigits - rightOperand.floatDigits;
		this.assemblerCode += "imul eax, " + Math.pow(10, x10nLeftO) + "\n";
		this.assemblerCode += "imul ebx, " + Math.pow(10, x10nRighttO) + "\n";

		var nasmOperation = additiveOperator == "+" ? "add" : "sub";
		this.assemblerCode += nasmOperation + " eax, ebx\n";

		this.UpdateLateIncrement();
		
		if (node.children[2])
			expressionResult = this.MoreTerms(node.children[2], context, expressionResult);

		return expressionResult;
	}

//	39.	<Factor> --> <Identificador> | <Constante Entera> | <Constante Flotante> | <Cadena> | <Carácter> | "!" <Factor> | <Llamada Función> | <Incremento> | "(" <Expresión> ")" | true | false
	this.Factor = function(node, context)
	{
		var firstChild = node.children[0]; 
		var expressionResult;

		if (firstChild.label == "FunctionCall")
		{
			expressionResult = this.FunctionCall(firstChild, context);
			if (currentVarInAssignment) // si esta función pertenece a una asignación de cierta variable esa cierta variable es marcada como usada.
				currentVarInAssignment.used = true;
		}
		else if (firstChild.label == "Increment")
		{
			expressionResult = this.Increment(firstChild, context);
			if (currentVarInAssignment) // si esta variable pertenece a una asignación de cierta variable esa cierta vaiable es marcada como usada.
				currentVarInAssignment.used = true;
		}
		else if (node.children.length == 3 && node.children[0].label == "(" && node.children[1].label == "Expression" && node.children[2].label == ")") // "(" <Expresión> ")"
		{
			expressionResult = this.Expression(node.children[1], context);
		}
		else if (node.children.length == 2 && node.children[0].label == "!" && node.children[1].label == "Factor") // "!" <Factor> 
		{
			expressionResult = this.Factor(node.children[1], context);
			if (expressionResult.type != "bool")
				throw  new Error("Operando de tipo inválido para el operador !", expressionResult.line, expressionResult.col, this.buildMessagesCtrl.errorType.ERROR);

			this.assemblerCode += "xor eax, 1\n"; 
		}
		else if (firstChild instanceof LeafNode)
		{
			var token = firstChild.token;
			switch(firstChild.token.code)
			{
				case this.lexCode.INTEGER_CONSTANT:
				case this.lexCode.FLOAT_CONSTANT:
				case this.lexCode.CHAR_CONSTANT:
				case this.lexCode.STRING:
				case this.lexCode.BOOLEAN:
				case this.lexCode.CHAR_CONSTANT:
					
					expressionResult = new ExpressionResult(this.GetDataTypeName(token.code), token.line, token.col);

					var nasmRax = this.GetNasmSuitableAx(this.GetTypeNumBytes(this.GetDataTypeName(token.code)));
					var nasmValue = token.value;
					this.assemblerCode += "mov eax, 0\n"; // aseguramos que no contenga ningún valor

					if (token.code == this.lexCode.BOOLEAN)
						nasmValue = token.value == "true" ? "1" : "0";

					if (token.code == this.lexCode.FLOAT_CONSTANT)
					{
						nasmValue = token.value.replace(/\.?0+$/, ""); // quita los ceros a la derecha solo deja uno solo si es que hay.
						var decimalDigits = nasmValue.match(/\.(\d+)/); // toma los decimales
						numDecimalDigits = decimalDigits == null ? 0 : decimalDigits[1].length; // calcula la cantidad de decimales
						expressionResult.floatDigits = numDecimalDigits;
						nasmValue = parseFloat(token.value) * Math.pow(10, numDecimalDigits); // multiplica por 10 a la número de décimales y así se guardará el flotante como un entero.
					}

					this.assemblerCode += "mov " + nasmRax + ", " + nasmValue + "\n";

					break;
				case this.lexCode.IDENTIFIER:

					var variable = this.FindVariable(token.value, context);
					if (variable == null)
						throw  new Error("La variable '" + token.value + "' no existe en este contexto.", token.line, token.col, this.buildMessagesCtrl.errorType.ERROR);
					expressionResult = new ExpressionResult(variable.type, token.line, token.col);
					if (currentVarInAssignment)// si este factor pertenece a una asignación de cierta variable es marcada como usada cuando se le asigna alguna variable la cuál también será marcada como usada.
						currentVarInAssignment.used = true;
					variable.used = true;

					var nasmRax = this.GetNasmSuitableAx(this.GetTypeNumBytes(variable.type));
					this.assemblerCode += "mov eax, 0\n"; // aseguramos que no contenga ningún valor
					this.assemblerCode += "mov "+nasmRax+", " + this.GetNasmSizeIndicator(variable.type) + "[" + this.nasmVariablesPrefix + variable.name + variable.context.id + "]\n";
					expressionResult.floatDigits = variable.floatDigits;
					break;
			}
		}

		return expressionResult;
	}

//	40.	<Más Factores> --> <Operador Multiplicativo> <Factor> <Más Factores> | Vacío
	this.MoreFactors = function(node, context, leftOperand)
	{
		var multiplicativeOperator = node.children[0].token.value;

		this.assemblerCode += "mov ebx, eax\n"; // guarda el operando izquierdo en ebx antes de ser modificado por la sig. instrucción.
		var rightOperand = this.Factor(node.children[1], context);
		this.assemblerCode += "xchg eax, ebx\n"; // intercambia los valores para mantener a eax como operando izquierdo y a ebx como operando derecho.

		if (!this.IsNumericType(leftOperand.type))
			throw  new Error("El tipo del operando izquierdo es inválido para el operador " + multiplicativeOperator, leftOperand.line, leftOperand.col, this.buildMessagesCtrl.errorType.ERROR);
		if (!this.IsNumericType(rightOperand.type))
			throw  new Error("El tipo del operando derecho es inválido para el operador " + multiplicativeOperator, rightOperand.line, rightOperand.col, this.buildMessagesCtrl.errorType.ERROR);	

		var expressionResult =  new ExpressionResult(leftOperand.type, leftOperand.line, leftOperand.col);

		if (leftOperand.type == "float" || rightOperand.type == "float")
			expressionResult.type = "float";

		this.assemblerCode += "mov edx, 0\n"; //limpia el dato de edx para que no ocurra un error de sobreflujo al operar en division o modulo

		switch(multiplicativeOperator)
		{
			case "*":
				expressionResult.floatDigits = leftOperand.floatDigits + rightOperand.floatDigits;
				this.assemblerCode += "imul ebx\n";
				break;
			case "/":
				expressionResult.floatDigits = rightOperand.floatDigits - leftOperand.floatDigits;
				this.assemblerCode += "idiv ebx\n";
				break;
			case "%":
				if (leftOperand.type == "float")
					throw  new Error("El tipo del operando izquierdo es inválido para el operador " + multiplicativeOperator, leftOperand.line, leftOperand.col, this.buildMessagesCtrl.errorType.ERROR);	
				if (rightOperand.type == "float")
					throw  new Error("El tipo del operando derecho es inválido para el operador " + multiplicativeOperator, rightOperand.line, rightOperand.col, this.buildMessagesCtrl.errorType.ERROR);	
				this.assemblerCode += "idiv ebx\n";
				this.assemblerCode += "mov eax, edx\n"; //  en edx se guarda la parte sobrante de la división por tanto se copia a eax
				break;
		}

		this.UpdateLateIncrement();

		if (node.children[2])
			expressionResult = this.MoreFactors(node.children[2], context, expressionResult);

		return expressionResult;
	}

//	41.	<Incremento> --> <Identificador> <Operador Incremento> | <Operador Incremento> <Identificador>
	this.Increment = function(node, context)
	{
		var identifierNode = node.children[0].token.code == this.lexCode.IDENTIFIER ? node.children[0] : node.children[1];
		var operatorNode = node.children[0].token.code == this.lexCode.IDENTIFIER ? node.children[1] : node.children[0];
		var variable = this.FindVariable(identifierNode.token.value, context);

		if (variable == null)
			throw  new Error("La variable '" + identifierNode.token.value + "' no existe en este contexto.", identifierNode.token.line, identifierNode.token.col, this.buildMessagesCtrl.errorType.ERROR);

		var expressionResult = new ExpressionResult(variable.type, identifierNode.token.col, identifierNode.token.line);

		if (!this.IsNumericType(variable.type))
			throw  new Error("Operando de tipo inválido para el operador " + operatorNode.token.value, identifierNode.token.line, identifierNode.token.col, this.buildMessagesCtrl.errorType.ERROR);		

		variable.used = true;

		var nasmOperation = operatorNode.token.value == "++" ? "inc" : "dec";
		if (node.children[0].token.code == this.lexCode.INCREMENT_OPERATOR) // solamente si el incremento es inmediado se aplica.
			this.assemblerCode += nasmOperation + " " + this.GetNasmSizeIndicator(variable.type) + " [" + this.nasmVariablesPrefix + variable.name + variable.context.id + "]\n";
		else // de lo contrario se avisa que se haga un incremento tarde.
		{
			currentNasmLateIncrementVariable = variable;
			currentNasmLateIncrementOperation = nasmOperation;
		}

		// Coloca en eax el valor del incremento por si es usado para asignación o relacionarlo con otro factor.
		var nasmRax = this.GetNasmSuitableAx(this.GetTypeNumBytes(variable.type));
		this.assemblerCode += "mov eax, 0\n";
		this.assemblerCode += "mov "+nasmRax+", " + this.GetNasmSizeIndicator(variable.type) + "[" + this.nasmVariablesPrefix + variable.name + variable.context.id + "]\n";
		expressionResult.floatDigits = variable.floatDigits;

		return expressionResult;
	}
}

function Variable(name, type, context, line, col)
{
	if (!(context instanceof Context))
		throw "El contexto debe ser instancia de Context";

	this.name = name;
	this.type = type;
	this.context = context;
	this.used = false;
	this.assigned = false;
	this.line = line;
	this.col = col;
	this.floatDigits = 0; // en caso de ser de tipo flotante se guarda la cantidad de digitos que tiene
}


function Function(name, returnType, context, signature, line, col)
{
	if (!(context instanceof Context))
		throw "El contexto debe ser instancia de Context";

	this.name = name;
	this.returnType = returnType;
	this.context = context;
	this.signature = signature;
	this.used = false;
	this.line = line;
	this.col = col;
}

function ExpressionResult(type, line, col)
{
	this.type = type;
	this.line = line;
	this.col = col;
	this.floatDigits = 0; // en caso de ser de tipo flotante se guarda la cantidad de digitos que tiene
}

var blockIdCounter = 1;
function Context(level)
{
	this.id = blockIdCounter++;
	this.level = level;
}