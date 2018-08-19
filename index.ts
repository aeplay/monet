import * as React from 'react';

export interface Mesh {
    vertices: Float32Array,
    indices: Uint32Array
}

interface LoadedMesh {
    verticesOnGPU: WebGLBuffer,
    indicesOnGPU: WebGLBuffer
}

export interface ShaderSource {
    fragment: string,
    vertex: string,
}

interface ShaderInfo {
    program: WebGLProgram,
    uniLocs: {[name: string]: WebGLUniformLocation},
    attrLocs: {[name: string]: number}
}

export interface LayerSpec {
    decal?: boolean,
    shader?: ShaderSource,
    batches: {
        mesh: Mesh,
        instances: Float32Array,
    }[]
}

export default class Monet extends React.Component<{
    width: number,
    height: number,
    retinaFactor: number,
    viewMatrix: Float32Array,
    perspectiveMatrix: Float32Array,
    layers: LayerSpec[],
    clearColor: [number, number, number, number]
}, {glError?: Error|{message: string}}> {
    private canvasRef: React.RefObject<HTMLCanvasElement> = React.createRef();
    private loadedMeshes: WeakMap<Mesh, LoadedMesh> = new WeakMap();
    private loadedInstances: WeakMap<Float32Array, WebGLBuffer> = new WeakMap();
    private loadedShaders: WeakMap<ShaderSource, ShaderInfo> = new WeakMap();
    private gl: WebGLRenderingContext;
    private instancing: ANGLE_instanced_arrays;

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
    }

    shouldComponentUpdate(nextProps, nextState) {
        return this.props.width !== nextProps.width || this.props.height !== nextProps.height
            || this.props.retinaFactor !== nextProps.retinaFactor || this.state.glError !== nextState.glError
    }

    renderFrame() {
        const gl = this.gl;
        const instancing = this.instancing;

        const {viewMatrix, perspectiveMatrix, layers, width, height, retinaFactor} = this.props;
        const actualWidth = width * retinaFactor;
        const actualHeight = height * retinaFactor;

        const [r, g, b, a] = this.props.clearColor;

        gl.viewport(0, 0, actualWidth, actualHeight);

        gl.clearColor(r, g, b, a);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        let previousShader = null;

        for (let layer of layers) {
            let shaderOnGPU = this.requestShaderOnGPU(layer.shader || solidColorShader);

            if (shaderOnGPU != previousShader) {
                gl.useProgram(shaderOnGPU.program);
    
                // setting up uniforms
                gl.uniformMatrix4fv(
                    shaderOnGPU.uniLocs.view,
                    false,
                    viewMatrix);
                gl.uniformMatrix4fv(
                    shaderOnGPU.uniLocs.perspective,
                    false,
                    perspectiveMatrix);

                previousShader = shaderOnGPU;
            }

            if (layer.decal) {
                gl.depthMask(false);
                gl.depthFunc(gl.ALWAYS);
            } else {
                gl.depthMask(true);
                gl.depthFunc(gl.LESS);
            }

            for (let batch of layer.batches) {
                if (!batch.mesh || batch.instances.length === 0) {continue;}
                const {verticesOnGPU, indicesOnGPU} = this.requestMeshOnGPU(batch.mesh);
                if (!verticesOnGPU || !indicesOnGPU) {continue;}

                // set up vertex attributes
                gl.bindBuffer(gl.ARRAY_BUFFER, verticesOnGPU);
                gl.vertexAttribPointer(shaderOnGPU.attrLocs.position, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(shaderOnGPU.attrLocs.position);
                instancing.vertexAttribDivisorANGLE(shaderOnGPU.attrLocs.position, 0);

                // set up index array
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesOnGPU);

                // create instance buffer
                const instancesOnGPU = this.requestInstancesOnGPU(batch.instances);
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

                instancing.drawElementsInstancedANGLE(
                    gl.TRIANGLES,
                    batch.mesh.indices.length,
                    gl.UNSIGNED_SHORT,
                    0,
                    batch.instances.length / 8
                );
            }
        }
    }

    private requestShaderOnGPU(shaderSource) {
        const loadedShader = this.loadedShaders.get(shaderSource);

        if (!loadedShader) {
            const gl = this.gl;
    
            const vertexShader = gl.createShader(gl.VERTEX_SHADER);
            gl.shaderSource(vertexShader, shaderSource.vertex);
            gl.compileShader(vertexShader);
            if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
                this.setState({glError: {message: "Error compiling vertex shader: " + gl.getShaderInfoLog(vertexShader)}})
                return null;
            }
    
            const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fragmentShader, shaderSource.fragment);
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
    
            const newLoadedShader = {
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
        } else {
            return loadedShader;
        }
    }

    private requestMeshOnGPU(mesh) {
        const gl = this.gl;
        const loadedMesh = this.loadedMeshes.get(mesh);

        if (!loadedMesh) {
            const verticesOnGPU = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, verticesOnGPU);
            gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STREAM_DRAW);

            const indicesOnGPU = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesOnGPU);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STREAM_DRAW);

            const newLoadedMesh = {verticesOnGPU, indicesOnGPU};

            this.loadedMeshes.set(mesh, newLoadedMesh);

            return newLoadedMesh;
        } else {
            return loadedMesh;
        }
    }

    private requestInstancesOnGPU(instances) {
        const gl = this.gl;
        const loadedInstances = this.loadedInstances.get(instances);

        if (!loadedInstances) {
            const newLoadedInstances = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, newLoadedInstances);
            gl.bufferData(gl.ARRAY_BUFFER, instances, gl.STREAM_DRAW);

            this.loadedInstances.set(instances, newLoadedInstances);

            return newLoadedInstances;
        } else {
            return loadedInstances;
        }
    }

    render() {
        if (this.state.glError) {
            return React.createElement("div", {className: "gl-error"}, ["WebGL error:", this.state.glError.message]);
        } else {
            return React.createElement("canvas", {
                ref: this.canvasRef,
                width: this.props.width * this.props.retinaFactor,
                height: this.props.height * this.props.retinaFactor,
                style: {width: this.props.width, height: this.props.height}
            });
        }
    }
}

export const solidColorShader = {
    vertex: `
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
}`,
    fragment: `
precision mediump float;
varying vec3 p;
varying vec3 color;
void main() {
    gl_FragColor = vec4(pow(color, vec3(1.0/2.2)), 1.0);
}`
};