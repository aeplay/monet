"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var React = require("react");
var Monet = /** @class */ (function (_super) {
    __extends(Monet, _super);
    function Monet() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.canvasRef = React.createRef();
        _this.loadedMeshes = new WeakMap();
        _this.loadedInstances = new WeakMap();
        _this.loadedShaders = new WeakMap();
        _this.state = {};
        return _this;
    }
    Monet.prototype.componentDidMount = function () {
        try {
            this.gl = this.canvasRef.current.getContext("webgl");
        }
        catch (ex) {
            this.setState({ glError: ex });
        }
        try {
            this.instancing = this.gl.getExtension("ANGLE_instanced_arrays");
        }
        catch (ex) {
            this.setState({ glError: ex });
        }
    };
    Monet.prototype.shouldComponentUpdate = function (nextProps, nextState) {
        return this.props.width !== nextProps.width || this.props.height !== nextProps.height
            || this.props.retinaFactor !== nextProps.retinaFactor || this.state.glError !== nextState.glError;
    };
    Monet.prototype.renderFrame = function () {
        var gl = this.gl;
        var instancing = this.instancing;
        var _a = this.props, viewMatrix = _a.viewMatrix, perspectiveMatrix = _a.perspectiveMatrix, layers = _a.layers, width = _a.width, height = _a.height, retinaFactor = _a.retinaFactor;
        var actualWidth = width * retinaFactor;
        var actualHeight = height * retinaFactor;
        var _b = this.props.clearColor, r = _b[0], g = _b[1], b = _b[2], a = _b[3];
        gl.viewport(0, 0, actualWidth, actualHeight);
        gl.clearColor(r, g, b, a);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        var previousShader = null;
        for (var _i = 0, layers_1 = layers; _i < layers_1.length; _i++) {
            var layer = layers_1[_i];
            var shaderOnGPU = this.requestShaderOnGPU(layer.shader || exports.solidColorShader);
            if (shaderOnGPU != previousShader) {
                gl.useProgram(shaderOnGPU.program);
                // setting up uniforms
                gl.uniformMatrix4fv(shaderOnGPU.uniLocs.view, false, viewMatrix);
                gl.uniformMatrix4fv(shaderOnGPU.uniLocs.perspective, false, perspectiveMatrix);
                previousShader = shaderOnGPU;
            }
            if (layer.decal) {
                gl.depthMask(false);
                gl.depthFunc(gl.ALWAYS);
            }
            else {
                gl.depthMask(true);
                gl.depthFunc(gl.LESS);
            }
            for (var _c = 0, _d = layer.batches; _c < _d.length; _c++) {
                var batch = _d[_c];
                if (!batch.mesh || batch.instances.length === 0) {
                    continue;
                }
                var _e = this.requestMeshOnGPU(batch.mesh), verticesOnGPU = _e.verticesOnGPU, indicesOnGPU = _e.indicesOnGPU;
                if (!verticesOnGPU || !indicesOnGPU) {
                    continue;
                }
                // set up vertex attributes
                gl.bindBuffer(gl.ARRAY_BUFFER, verticesOnGPU);
                gl.vertexAttribPointer(shaderOnGPU.attrLocs.position, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(shaderOnGPU.attrLocs.position);
                instancing.vertexAttribDivisorANGLE(shaderOnGPU.attrLocs.position, 0);
                // set up index array
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesOnGPU);
                // create instance buffer
                var instancesOnGPU = this.requestInstancesOnGPU(batch.instances);
                gl.bindBuffer(gl.ARRAY_BUFFER, instancesOnGPU);
                // set up instance attributes
                // layout: {position: [f32; 3], direction: [f32; 2], color: [f32; 3]}
                gl.vertexAttribPointer(shaderOnGPU.attrLocs.instancePosition, 3, gl.FLOAT, false, 8 * 4, 0);
                gl.enableVertexAttribArray(shaderOnGPU.attrLocs.instancePosition);
                instancing.vertexAttribDivisorANGLE(shaderOnGPU.attrLocs.instancePosition, 1);
                gl.vertexAttribPointer(shaderOnGPU.attrLocs.instanceDirection, 2, gl.FLOAT, false, 8 * 4, 3 * 4);
                gl.enableVertexAttribArray(shaderOnGPU.attrLocs.instanceDirection);
                instancing.vertexAttribDivisorANGLE(shaderOnGPU.attrLocs.instanceDirection, 1);
                gl.vertexAttribPointer(shaderOnGPU.attrLocs.instanceColor, 3, gl.FLOAT, false, 8 * 4, 5 * 4);
                gl.enableVertexAttribArray(shaderOnGPU.attrLocs.instanceColor);
                instancing.vertexAttribDivisorANGLE(shaderOnGPU.attrLocs.instanceColor, 1);
                instancing.drawElementsInstancedANGLE(gl.TRIANGLES, batch.mesh.indices.length, gl.UNSIGNED_SHORT, 0, batch.instances.length / 8);
            }
        }
    };
    Monet.prototype.requestShaderOnGPU = function (shaderSource) {
        var loadedShader = this.loadedShaders.get(shaderSource);
        if (!loadedShader) {
            var gl = this.gl;
            var vertexShader = gl.createShader(gl.VERTEX_SHADER);
            gl.shaderSource(vertexShader, shaderSource.vertex);
            gl.compileShader(vertexShader);
            if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
                this.setState({ glError: { message: "Error compiling vertex shader: " + gl.getShaderInfoLog(vertexShader) } });
                return null;
            }
            var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fragmentShader, shaderSource.fragment);
            gl.compileShader(fragmentShader);
            if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
                this.setState({ glError: { message: "Error compiling fragment shader: " + gl.getShaderInfoLog(fragmentShader) } });
                return null;
            }
            var shaderProgram = gl.createProgram();
            gl.attachShader(shaderProgram, vertexShader);
            gl.attachShader(shaderProgram, fragmentShader);
            gl.linkProgram(shaderProgram);
            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
                this.setState({ glError: { message: "Could not link shader program." } });
                return null;
            }
            gl.useProgram(shaderProgram);
            var newLoadedShader = {
                program: shaderProgram,
                uniLocs: {
                    view: gl.getUniformLocation(shaderProgram, 'view'),
                    perspective: gl.getUniformLocation(shaderProgram, 'perspective'),
                },
                attrLocs: {
                    position: gl.getAttribLocation(shaderProgram, 'position'),
                    instancePosition: gl.getAttribLocation(shaderProgram, 'instance_position'),
                    instanceDirection: gl.getAttribLocation(shaderProgram, 'instance_direction'),
                    instanceColor: gl.getAttribLocation(shaderProgram, 'instance_color'),
                },
            };
            this.loadedShaders.set(shaderSource, newLoadedShader);
            return newLoadedShader;
        }
        else {
            return loadedShader;
        }
    };
    Monet.prototype.requestMeshOnGPU = function (mesh) {
        var gl = this.gl;
        var loadedMesh = this.loadedMeshes.get(mesh);
        if (!loadedMesh) {
            var verticesOnGPU = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, verticesOnGPU);
            gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STREAM_DRAW);
            var indicesOnGPU = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesOnGPU);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STREAM_DRAW);
            var newLoadedMesh = { verticesOnGPU: verticesOnGPU, indicesOnGPU: indicesOnGPU };
            this.loadedMeshes.set(mesh, newLoadedMesh);
            return newLoadedMesh;
        }
        else {
            return loadedMesh;
        }
    };
    Monet.prototype.requestInstancesOnGPU = function (instances) {
        var gl = this.gl;
        var loadedInstances = this.loadedInstances.get(instances);
        if (!loadedInstances) {
            var newLoadedInstances = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, newLoadedInstances);
            gl.bufferData(gl.ARRAY_BUFFER, instances, gl.STREAM_DRAW);
            this.loadedInstances.set(instances, newLoadedInstances);
            return newLoadedInstances;
        }
        else {
            return loadedInstances;
        }
    };
    Monet.prototype.render = function () {
        if (this.state.glError) {
            return React.createElement("div", { className: "gl-error" }, ["WebGL error:", this.state.glError.message]);
        }
        else {
            return React.createElement("canvas", {
                ref: this.canvasRef,
                width: this.props.width * this.props.retinaFactor,
                height: this.props.height * this.props.retinaFactor,
                style: { width: this.props.width, height: this.props.height }
            });
        }
    };
    return Monet;
}(React.Component));
exports.default = Monet;
exports.solidColorShader = {
    vertex: "\nprecision mediump float;\nuniform mat4 view;\nuniform mat4 perspective;\nattribute vec3 position;\nattribute vec3 instance_position;\nattribute vec2 instance_direction;\nattribute vec3 instance_color;\nvarying vec3 p;\nvarying vec3 color;\n\nvoid main() {\n    mat4 model = mat4(1.0); // unit diagonal\n    mat4 modelview = view * model;\n    vec2 orth_instance_direction = vec2(-instance_direction.y, instance_direction.x);\n    vec3 rotated_position = vec3(position.x * instance_direction + position.y * orth_instance_direction, position.z);\n    gl_Position = perspective * modelview * vec4(rotated_position + instance_position, 1.0);\n    p = position;\n    color = instance_color;\n}",
    fragment: "\nprecision mediump float;\nvarying vec3 p;\nvarying vec3 color;\nvoid main() {\n    gl_FragColor = vec4(pow(color, vec3(1.0/2.2)), 1.0);\n}"
};
