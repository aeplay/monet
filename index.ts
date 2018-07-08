import * as React from 'react';

export interface Mesh {
    vertices: Float32Array,
    indices: Uint32Array
}

interface LoadedMesh {
    verticesOnGPU: WebGLBuffer,
    indicesOnGPU: WebGLBuffer
}

interface ShaderInfo {
    program: WebGLProgram,
    uniLocs: {[name: string]: WebGLUniformLocation},
    attrLocs: {[name: string]: number}
}

export interface LayerSpec {
    decal?: boolean,
    batches: {
        mesh: Mesh,
        instances: Float32Array,
    }[]
}

export default class Monet extends React.Component<{
    width: number,
    height: number,
    viewMatrix: Float32Array,
    perspectiveMatrix: Float32Array,
    layers: LayerSpec[],
    clearColor: [number, number, number, number]
}, {glError?: Error|{message: string}}> {
    private canvasRef: React.RefObject<HTMLCanvasElement> = React.createRef();
    private loadedMeshes: WeakMap<Mesh, LoadedMesh> = new WeakMap();
    private gl: WebGLRenderingContext;
    private instancing: ANGLE_instanced_arrays;
    private shader: ShaderInfo;

    state: {glError?: Error|{message: string}} = {};

    componentDidMount() {
        try { 
            this.gl = this.canvasRef.current.getContext("webgl");
        } catch (ex) {
            this.setState({glError: ex})
        }
        try {
            this.instancing = this.gl.getExtension("ANGLE_instanced_arrays")
        } catch (ex) {
            this.setState({glError: ex})
        }
        const gl = this.gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, solidVertexShader);
        gl.compileShader(vertexShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            this.setState({glError: {message: "Error compiling vertex shader: " + gl.getShaderInfoLog(vertexShader)}})
            return null;
        }

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, solidFragmentShader);
        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            this.setState({glError: {message: "Error compiling vertex shader: " + gl.getShaderInfoLog(fragmentShader)}})
            return null;
        }

        const shaderProgram = gl.createProgram();
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram);
        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            this.setState({glError: {message: "Could not link shader program."}});
            return null
        }

        gl.useProgram(shaderProgram);

        this.shader = {
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

        requestAnimationFrame(() => this.renderFrame())
    }

    shouldComponentUpdate(nextProps) {
        return this.props.width !== nextProps.width || this.props.height !== nextProps.height
    }

    renderFrame() {
        const gl = this.gl;
        const instancing = this.instancing;
        const shader = this.shader;

        const {viewMatrix, perspectiveMatrix, layers, width, height} = this.props;

        console.log("Frame start");

        const [r, g, b, a] = this.props.clearColor;

        gl.viewport(0, 0, width, height);

        gl.clearColor(r, g, b, a);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(shader.program);

        // setting up uniforms
        gl.uniformMatrix4fv(
            shader.uniLocs.view,
            false,
            viewMatrix);
        gl.uniformMatrix4fv(
            shader.uniLocs.perspective,
            false,
            perspectiveMatrix);

        for (let layer of layers) {

            if (layer.decal) {
                gl.depthMask(false);
                gl.depthFunc(gl.ALWAYS);
            } else {
                gl.depthMask(true);
                gl.depthFunc(gl.LESS);
            }

            for (let batch of layer.batches) {
                if (!batch.mesh || batch.instances.length === 0) {continue;}
                const {verticesOnGPU, indicesOnGPU} = this.requestOnGPU(batch.mesh);
                if (!verticesOnGPU || !indicesOnGPU) {continue;}

                // set up vertex attributes
                gl.bindBuffer(gl.ARRAY_BUFFER, verticesOnGPU);
                gl.vertexAttribPointer(shader.attrLocs.position, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(shader.attrLocs.position);
                instancing.vertexAttribDivisorANGLE(shader.attrLocs.position, 0);

                // set up index array
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesOnGPU);

                // create instance buffer
                const instancesOnGPU = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, instancesOnGPU);
                gl.bufferData(gl.ARRAY_BUFFER, batch.instances, gl.STATIC_DRAW);

                // set up instance attributes
                // layout: {position: [f32; 3], direction: [f32; 2], color: [f32; 3]}
                gl.vertexAttribPointer(shader.attrLocs.instancePosition, 3, gl.FLOAT, false, 8 * 4, 0);
                gl.enableVertexAttribArray(shader.attrLocs.instancePosition);
                instancing.vertexAttribDivisorANGLE(shader.attrLocs.instancePosition, 1);

                gl.vertexAttribPointer(shader.attrLocs.instanceDirection, 2, gl.FLOAT, false, 8 * 4, 3 * 4);
                gl.enableVertexAttribArray(shader.attrLocs.instanceDirection);
                instancing.vertexAttribDivisorANGLE(shader.attrLocs.instanceDirection, 1);

                gl.vertexAttribPointer(shader.attrLocs.instanceColor, 3, gl.FLOAT, false, 8 * 4, 5 * 4);
                gl.enableVertexAttribArray(shader.attrLocs.instanceColor);
                instancing.vertexAttribDivisorANGLE(shader.attrLocs.instanceColor, 1);

                instancing.drawElementsInstancedANGLE(
                    gl.TRIANGLES,
                    batch.mesh.indices.length,
                    gl.UNSIGNED_SHORT,
                    0,
                    batch.instances.length / 8
                );
            }
        }

        requestAnimationFrame(() => this.renderFrame())
    }

    private requestOnGPU(mesh) {
        const gl = this.gl;
        const loadedMesh = this.loadedMeshes.get(mesh);

        if (!loadedMesh) {
            const verticesOnGPU = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, verticesOnGPU);
            gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

            const indicesOnGPU = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesOnGPU);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

            const newLoadedMesh = {verticesOnGPU, indicesOnGPU};

            this.loadedMeshes.set(mesh, newLoadedMesh);

            return newLoadedMesh;
        } else {
            return loadedMesh;
        }
    }

    render() {
        if (this.state.glError) {
            return React.createElement("div", {className: "gl-error"}, ["WebGL error:", this.state.glError.message]);
        } else {
            return React.createElement("canvas", { ref: this.canvasRef, width: this.props.width, height: this.props.height });
        }
    }
}

const solidVertexShader = `
precision mediump float;
uniform mat4 view;
uniform mat4 perspective;
attribute vec3 position;
attribute vec3 instance_position;
attribute vec2 instance_direction;
attribute vec3 instance_color;
varying vec3 p;
varying vec3 color;

void main() {
    mat4 model = mat4(1.0); // unit diagonal
    mat4 modelview = view * model;
    vec2 orth_instance_direction = vec2(-instance_direction.y, instance_direction.x);
    vec3 rotated_position = vec3(position.x * instance_direction + position.y * orth_instance_direction, position.z);
    gl_Position = perspective * modelview * vec4(rotated_position + instance_position, 1.0);
    p = position;
    color = instance_color;
}`;

const solidFragmentShader = `
precision mediump float;
varying vec3 p;
varying vec3 color;
void main() {
    gl_FragColor = vec4(pow(color, vec3(1.0/2.2)), 1.0);
}`;