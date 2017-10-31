/*
	Angel Fernando Carriola Monroy
*/

document.addEventListener("DOMContentLoaded", Start, false);
var scanner;
var parser;
var semanticAnalizer;
var buildMessagesCtrl;
var editor;
var nasmEditor;
var graphicTree;
var treeCanvas;
var goTree;
var go_make;

function Start()
{
	var buildButton = document.getElementById("buildButton");
	var buildMessagesDiv = document.getElementById("buildMessages");
	var errorMessage = document.getElementById("errorMessage");
	buildMessagesCtrl = new BuildMessages(buildMessagesDiv);
	editor = ace.edit("editor");
    editor.setTheme("ace/theme/monokai");
    editor.getSession().setMode("ace/mode/c_cpp");
    editor.getSession().setUseWorker(false);
    nasmEditor = ace.edit("nasm");
    nasmEditor.setTheme("ace/theme/monokai");
    nasmEditor.getSession().setMode("ace/mode/assembly_x86");
    nasmEditor.getSession().setUseWorker(false);
	tree = document.getElementById("tree");

    $("#codeTabs a").click(function(e){
        e.preventDefault();
        $(this).tab('show');
    });

	//graphicTree = new GraphicDerivationTree(treeCanvas, new RootNode("Test"));
	go_make = go.GraphObject.make;
	goTree = 
		go_make(go.Diagram, "tree",  // each diagram refers to its DIV HTML element by id
        {
            initialAutoScale: go.Diagram.UniformToFill,  // automatically scale down to show whole tree
            maxScale: 1,
            minScale: 0.8,
            contentAlignment: go.Spot.Center,  // center the tree in the viewport
            isReadOnly: true,  // don't allow user to change the diagram
            "animationManager.isEnabled": false,
            layout: go_make(go.TreeLayout,
                      	{ angle: 90, sorting: go.TreeLayout.SortingAscending }),
            maxSelectionCount: 1  // only one node may be selected at a time in each diagram
        });
    goTree.nodeTemplate = 
    	go_make(go.Node, "Auto",
          	{ locationSpot: go.Spot.Center },
          	//new go.Binding("text", "key", go.Binding.toString),  // for sorting
          	go_make(go.Shape, "RoundedRectangle",
            	new go.Binding("fill", "color"),
            	{ stroke: "gray" }),
          	go_make(go.TextBlock,
            	{ margin: 1 },
            	new go.Binding("text", "name", function(k) { return "" + k; })
            	)
        );

    var This = this;
	buildButton.addEventListener("click", function(){This.Validate()}, false);

	this.Validate = function()
	{
		buildMessagesCtrl.Clear();
		scanner = new Scanner(editor.getValue(), buildMessagesCtrl);
		scanner.Start();
        if (scanner.success)
        {
    		parser = new Parser(scanner.tokenList, scanner.lexCode, buildMessagesCtrl);
    		parser.Start();
    		UpdateGoTree(parser.tree);

            if (parser.success)
            {
                semanticAnalizer = new SemanticAnalizer(parser.tree, scanner.lexCode, buildMessagesCtrl);
                semanticAnalizer.Start();
                if (semanticAnalizer.success)
                {
                    $("#nasmTab a").tab("show");
                    nasmEditor.setValue(semanticAnalizer.assemblerCode);
                }
            }
        }

	}
}

function NotificationMessage(messageText)
{
	notificationMessage.innerHTML = messageText;
}

function ErrorMessage(messageText)
{
	errorMessage.innerHTML = messageText
}

var keyCounter;
function UpdateGoTree(treeNode, goTreeModel, parentKey) 
{
	if (!(treeNode instanceof RootNode || treeNode instanceof InternalNode || treeNode instanceof LeafNode))
		throw "El nodo debe ser instancia de RootNode, InternalNode o LeafNode";

	var parentKey = parentKey;

    if (treeNode instanceof  RootNode)
    {
    	keyCounter = 0;
    	parentKey = keyCounter;
    	goTreeModel = [];
	    goTreeModel.push({
	    	key: parentKey,
	    	name: "<" + treeNode.label + ">",
	    	color: "#dddddd"
	    });
	}

    for (var i = 0; i < treeNode.children.length; i++)
    {
    	var child = treeNode.children[i];
    	goTreeModel.push({
    		key: ++keyCounter,
    		name: child instanceof LeafNode ? child.label : "<" + child.label + ">",
    		parent: parentKey,
    		color: child instanceof LeafNode ? "#99eeff" : "#F7F784"
    	});
    	if (!(child instanceof LeafNode))
    		UpdateGoTree(child, goTreeModel, goTreeModel[goTreeModel.length-1].key);
    }

    if (treeNode instanceof RootNode)
    {
    	goTree.model = new go.TreeModel(goTreeModel);
    }
}