//===========
//  Globals
//===========
//Parsed json data file w/ map positions & other node data
var mapData;
//The main sprite for the Atlas. (background image)
var atlasSprite;
//Self explanatory.
var linesContainer;
var nodesContainer;
//Render Toggles
var boolDrawLines = true;
var boolDrawNodes = true;
var boolDrawNames = true;

//Create the Pixi Application
let maxH = 2304;
let maxW = 4096;
let pixiH = 2304;
let pixiW = 4096;

let app =  new PIXI.Application({
    width: pixiW,
    height: pixiH,
    autoStart: false,
    autoResize:true,
    antialias: true,
    sharedLoader: true,
    sharedTicker: true,
    resizeTo: window
});

//Load Pixi resources
const loader = PIXI.Loader.shared;
loader.onProgress.add(loadProgressHandler);
loader.onComplete.add(createPixiView);
loader
    .add("img/Atlas.jpg")
    .load(setup);

//The center position of the PIXI canvas. Updates automatically when resized.
var midx = 0;
var midy = 0;

//===========
// Functions
//===========
function loadProgressHandler() {

}
function setup(loader, resources) {
    //==================
    //  Initialization
    //==================
    createPixiView();
    initPixiDisplayObjects(loader, resources);
    onWindowResize();
    window.addEventListener('resize', onWindowResize);
    loadMapsData();
    initAtlasTierButtons();
    

    //60fps (more?) Animation Ticker (is this fps capped?)
    // app.ticker.add(delta => animationLoop(delta));
}
function createPixiView() {
    //Add the canvas that Pixi automatically created for you to the HTML document
    domTarget = document.getElementById("atlas_of_worlds");
    domTarget.appendChild(app.view);
    domTarget.lastChild.className = "pixi_atlas_of_worlds";
    
}

function resizePixiView() {
    // app.renderer.resize(pixiW, pixiH);
    atlasSprite.scale.set(pixiW/maxW, pixiH/maxH);
    let windowMidX = app.screen.width/2;
    let windowMidY = app.screen.height/2;
    let xOffset = (app.screen.width-pixiW)/2;
    let yOffset = (app.screen.height-pixiH)/2;
    atlasSprite.position.set(windowMidX, windowMidY);
    linesContainer.x = xOffset;
    linesContainer.y = yOffset;
    nodesContainer.x = xOffset;
    nodesContainer.y = yOffset;
}

function initPixiDisplayObjects(loader, resources) {
    //Create main Atlas sprite
    atlasSprite = new PIXI.Sprite(resources["img/Atlas.jpg"].texture);
    
    //Add Atlas sprite to stage
    app.stage.addChildAt(atlasSprite, 0);
    atlasSprite.anchor.set(0.5);
    initPixiContainers();
}
function initPixiContainers() {
    //Create main containers for Lines and Nodes
    linesContainer = new PIXI.Container();
    nodesContainer = new PIXI.Container();

    //Add Lines and Nodes containers to stage. (Lines 1st, so that they are in back.)
    app.stage.addChild(linesContainer);
    app.stage.addChild(nodesContainer);

    // linesContainer.anchor.set(0.5);
    // nodesContainer.anchor.set(0.5);
}

//Factor by which to multiply node positions from the data file when drawing
var mapScaleFactor = pixiW/maxW*4;//4.05; //TODO: Make sure that pixi's text rendering is not the cause of misalignments.
var regionTiers = [0,0,0,0,0,0,0,0]; //Tiers of each region (array index = regionID)
var regionNodes = [[], [], [], [], [], [], [], []]; //lists of nodes(IDs) in each region
//Request map data, parse it, and draw all Atlas regions for the 1st time.
function loadMapsData(loader, resources, atlasSprite) {
    
    let request = new XMLHttpRequest();
    request.open("GET", "data/AtlasNodeItemized.json", true);
    request.send(null);
    request.onreadystatechange = function() {
        if ( request.readyState === 4 && request.status === 200 ) {
            mapData = JSON.parse(request.responseText);
            // console.log(mapData);
            // Init regionNodes (list) (Add RowIDs of nodes to their respective region lists)
            for (let i=0; i<mapData.length; i++) {
                let entry = mapData[i];
                regionNodes[entry.AtlasRegionsKey].push(entry.RowID);
            }
        }

        //Draw Atlas Nodes & Lines
        drawAllAtlasRegions();
        //(This ^^^ must be in here, instead of after the call to loadMapsData, because the...
        //  http request is async. The resources wouldn't necessarily be loaded when the...
        //  drawAllAtlasRegions function is called.)
    }

}

function drawAllAtlasRegions() {
    for(let i=0; i<regionTiers.length; i++) {
        drawAtlasRegion(i, false);
    }
}

function drawAtlasRegion(regionID, boolRedrawAdjacent) {
    
    //Remove previous nodes and lines for this region.
    if (linesContainer.children.length > regionID) {
        // linesContainer.removeChildAt(regionID);
        // nodesContainer.removeChildAt(regionID);
        //This removes all references to the container AND child DisplayObjects, allowing...
        //  the garbage collector to remove them from memory. Simply doing...
        //  container.removeChildAt does not do this
        linesContainer.getChildAt(regionID).destroy(true, false, false);
        nodesContainer.getChildAt(regionID).destroy(true, false, false);
    }

    //This bit keeps track of whether adjacent regions have been redrawn w/in this func call
    boolRedrawAdjacent = boolRedrawAdjacent || false;
    let regionsRedrawn = [false, false, false, false, false, false, false, false];

    //init region nodes Graphics object (Nodes)
    let regionNodesGraph = new PIXI.Graphics();
    regionNodesGraph.lineStyle(2, '0x0', 1, 0.5, false);
    regionNodesGraph.beginFill(0,1)
    const nodeCenterOffset = 25*mapScaleFactor/4;
    const nodeRadius = 30*mapScaleFactor/4;

    //init region lines Graphics object (Lines)
    let regionLinesGraph = new PIXI.Graphics();
    let lineThickness = 2;
    let lineColor = 0xffffff;

    //Set text display options
    let textDisplayOptions = {fontFamily : 'Arial', fontSize: 24*mapScaleFactor/4, fill : 0xff1010, align : 'center'};

    //Add Nodes and Lines to their respective containers
    linesContainer.addChildAt(regionLinesGraph, regionID);
    nodesContainer.addChildAt(regionNodesGraph, regionID);

    //'region' stores the IDs of the nodes in this region.
    let region = regionNodes[regionID];
    //Do not redraw the region that is currently being drawn.
    regionsRedrawn[regionID] = true;

    //loop over nodes in this region
    for (let i=0; i<region.length; i++) {
        let entry = region[i];

        //Node location and neighbor IDs
        let entryData = getTieredNodeDataByID(entry);
        let entryX = entryData[0];
        let entryY = entryData[1];
        let entryAtlasNodeKeys = entryData[2];
        
        //Draw Connecting Lines between nodes (PIXI.Graphics)
        if (boolDrawLines) {
            for (let i=0; i<entryAtlasNodeKeys.length; i++) {
                let adjNodeKey = entryAtlasNodeKeys[i];
                let adjNodeData = getTieredNodeDataByID(adjNodeKey)
    
                //Draw Lines
                regionLinesGraph.lineStyle(lineThickness, lineColor)
                    .moveTo(entryX+nodeCenterOffset, entryY+nodeCenterOffset)
                    .lineTo(adjNodeData[0]+nodeCenterOffset, adjNodeData[1]+nodeCenterOffset);
    
                //Redraw adjacent region if not already done.
                let adjNodeRegionKey = mapData[adjNodeKey].AtlasRegionsKey;
                if (boolRedrawAdjacent && regionsRedrawn[adjNodeRegionKey] === false) {
                    regionsRedrawn[adjNodeRegionKey] = true;
                    drawAtlasRegion(adjNodeRegionKey);
                }
            }
        }

        //Draw Nodes on 'regionNodesGraph'
        if (boolDrawNodes) {
            regionNodesGraph.drawCircle(
                entryX+nodeCenterOffset,
                entryY+nodeCenterOffset,
                nodeRadius);
        }
        //Add node label text sprites to 'regionNodesGraph' 
        if (boolDrawNames) {
            let textSprite = new PIXI.Text(entry, textDisplayOptions);
            textSprite.x = entryX;
            textSprite.y = entryY;
            regionNodesGraph.addChild(textSprite);
        }
        
    }

    //Force immediate stage render
    //TODO see if something like this helps at ALL, or if its actually a hindrance.
    app.renderer.render(app.stage);
}

// Returns an array of length 3 based on the supplied region tier.
// Format: [node_x_pos, node_y_pos, [list_of_neighbor_node_ids]]
function getTieredNodeDataByID(nodeID) {

    let entry = mapData[nodeID];
    let tier = regionTiers[entry.AtlasRegionsKey];
    //Defualt entryX and entryY (offscreen)
    let entryX = -100;
    let entryY = -100;
    //Neighbor node keys
    let atlasNodeKeys = [];
    switch(tier) {
    case 0:
        if (entry.Tier0 > 0) {
            entryX = entry.X0*mapScaleFactor;
            entryY = entry.Y0*mapScaleFactor;
            atlasNodeKeys = entry.AtlasNodeKeys0;
        }
        break;
    case 1:
        if (entry.Tier1 > 0) {
            entryX = entry.X1*mapScaleFactor;
            entryY = entry.Y1*mapScaleFactor;
            atlasNodeKeys = entry.AtlasNodeKeys1;
        }
        break;
    case 2:
        if (entry.Tier2 > 0) {
            entryX = entry.X2*mapScaleFactor;
            entryY = entry.Y2*mapScaleFactor;
            atlasNodeKeys = entry.AtlasNodeKeys2;
        }
        break;
    case 3:
        if (entry.Tier3 > 0) {
            entryX = entry.X3*mapScaleFactor;
            entryY = entry.Y3*mapScaleFactor;
            atlasNodeKeys = entry.AtlasNodeKeys3;
        }
        break;
    case 4:
        if (entry.Tier4 > 0) {
            entryX = entry.X4*mapScaleFactor;
            entryY = entry.Y4*mapScaleFactor;
            atlasNodeKeys = entry.AtlasNodeKeys4;
        }
        break;
    }

    return [entryX, entryY, atlasNodeKeys];
}

function cycleAllAtlasRegionTiers() {
    
    for(let i=0; i<regionTiers.length; i++) {
        if (regionTiers[i] < 4) {
            regionTiers[i] += 1;
        } else {
            regionTiers[i] = 0;
        }
        let btn = document.getElementsByClassName("watchstone "+i);
        btn[0].innerHTML = "Tier "+regionTiers[i];
    }
    drawAllAtlasRegions();
}

function cycleAtlasRegionTier(regionID) {
    if (regionTiers[regionID] < 4) {
        regionTiers[regionID] += 1;
    } else {
        regionTiers[regionID] = 0;
    }
    //Update corresponding button label
    document.getElementsByClassName("watchstone "+regionID)[0].innerHTML
        = "Tier "+regionTiers[regionID];
    
    //Redraw this region & adjacent regions
    drawAtlasRegion(regionID, true);
}

//Place Atlas tier buttons, set their click function, and...
// automatically reposition them if window is resized 
function initAtlasTierButtons() {
    
    //init "master" tier button (cycle all nodes) click function
    document.getElementById("master_tier_button")
        .addEventListener("click", cycleAllAtlasRegionTiers);

    //init region ("watchstone") tier buttons click functions
    let watchstoneButtons = document.getElementsByClassName("watchstone");
    for(let i=1; i<watchstoneButtons.length; i++){
        watchstoneButtons[i].addEventListener("click", function() {cycleAtlasRegionTier(i-1);} );
    }
    placeAtlasTierButtons();
}

//Place atlas tier buttons in center, stacked vertically
function placeAtlasTierButtons() {
    let elements = document.getElementsByClassName("watchstone centered");
    let btnHeight = elements[0].offsetHeight;
    let y0 = (elements.length*btnHeight)/2;

    for(let i=0; i<elements.length; i++){
        placeElement(elements[i], midx, midy-y0+i*btnHeight);
    }
}

function placeElementByID(elementID, x_pos, y_pos) {
    placeElement(document.getElementById(elementID), x_pos, y_pos);
}

function placeElement(element, x_pos, y_pos) {
    element.style.position = "absolute";
    element.style.left = x_pos+'px';
    element.style.top = y_pos+'px';
}

//Stores the position of the center of the PIXI canvas, not the window.
function onWindowResize() {
    let innerHeight = window.innerHeight;
    let innerWidth = window.innerWidth;
    if (innerHeight > innerWidth) {
        // midx = innerWidth/2;
        // midy = (innerWidth/pixiW * pixiH)/2

        pixiW = innerWidth;
        pixiH = innerWidth*(maxH/maxW);
    } else {
        // midy = innerHeight/2;
        // midx = (innerHeight/pixiH * pixiW)/2

        pixiH = innerHeight;
        pixiW = innerHeight*(maxW/maxH);
    }
     midx = app.screen.width/2;
     midy = app.screen.height/2;
    placeAtlasTierButtons();
    resizePixiView();
    mapScaleFactor = pixiW/maxW*4;
    drawAllAtlasRegions();
}

function removeElementsByClass(className){
    let elements = document.getElementsByClassName(className);
    while(elements.length > 0){
        elements[0].parentNode.removeChild(elements[0]);
    }
}


// ===============================
// Notes and currently unused
// ===============================
function usefulTools() {
    app.renderer.backgroundColor = 0x061639;

    app.renderer.autoResize = true;
    app.renderer.resize(512, 512);

    //Fill entire window (css styling)
    app.renderer.view.style.position = "absolute";
    app.renderer.view.style.display = "block";
    app.renderer.autoResize = true;
    app.renderer.resize(window.innerWidth, window.innerHeight);
    //if you do ^^^ do this to all HTML elements: <style>* {padding: 0; margin: 0}</style>

    // Alternative: sprite.position.set(x, y)
    //cat.scale.x = 2;
    //cat.scale.y = 2;
    //cat.scale.set(0.5, 0.5);
    //cat.rotation = 0.5;
    // Anchor for Location, Pivot for Rotation
    // cat.anchor.x = 0.5;
    // cat.anchor.y = 0.5;
    // cat.anchor.set(x, y)
    // cat.pivot.set(32, 32)
    
    //Make Fullscreen
    // app.renderer.view.style.position = "absolute";
    // app.renderer.view.style.display = "block";
    // app.renderer.autoResize = true;
    // app.renderer.resize(window.innerWidth, window.innerHeight);

}

function clearPixiViews() {
    removeElementsByClass("pixi_atlas_of_worlds");
}

let directionMult = 1;
function animationLoop(delta) {
    
    // let lib = app.stage.getChildAt(1);
    
    // if (lib.y < 0 || lib.y > 100) {
    //     directionMult *= -1;
    // }
    
    // lib.y += 1*directionMult;

}
