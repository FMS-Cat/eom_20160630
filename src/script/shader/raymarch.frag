#define MARCH_ITER 40
#define RAYAMP_MIN 0.0
#define INIT_LEN 0.01
#define NSAMPLE 3
#define NREF 10
#define SKY_COLOR vec3( 0.02 )

#define IFS_ITER 4

// ---

#define PI 3.14159265
#define V vec2(0.,1.)
#define saturate(i) clamp(i,0.,1.)
#define lofi(i,m) (floor((i)*(m))/(m))

// ---

precision highp float;

uniform float time;
uniform vec2 resolution;

uniform sampler2D textureRandom;
uniform sampler2D textureWordAlmost;
uniform sampler2D textureWordHalfway;
uniform sampler2D textureWordThrough;
uniform sampler2D textureWord2016;

// ---

vec3 color;
vec3 amp;

// ---

vec4 seed;
float preRandom() {
  const vec4 q = vec4(   1225.0,    1585.0,    2457.0,    2098.0);
  const vec4 r = vec4(   1112.0,     367.0,      92.0,     265.0);
  const vec4 a = vec4(   3423.0,    2646.0,    1707.0,    1999.0);
  const vec4 m = vec4(4194287.0, 4194277.0, 4194191.0, 4194167.0);

  vec4 beta = floor(seed / q);
  vec4 p = a * (seed - beta * q) - beta * r;
  beta = (sign(-p) + vec4(1.0)) * vec4(0.5) * m;
  seed = (p + beta);

  return fract(dot(seed / m, vec4(1.0, -1.0, 1.0, -1.0)));
}

vec4 random() {
  return vec4(
    preRandom(),
    preRandom(),
    preRandom(),
    preRandom()
  );
}

// ---

mat2 rotate2D( float _t ) {
  return mat2( cos( _t ), sin( _t ), -sin( _t ), cos( _t ) );
}

vec3 rotateEuler( vec3 _p, vec3 _r ) {
  vec3 p = _p;
  p.yz = rotate2D( _r.x ) * p.yz;
  p.zx = rotate2D( _r.y ) * p.zx;
  p.xy = rotate2D( _r.z ) * p.xy;
  return p;
}

float smin( float _a, float _b, float _k ) {
  float h = clamp( 0.5 + 0.5 * ( _b - _a ) / _k, 0.0, 1.0 );
  return mix( _b, _a, h ) - _k * h * ( 1.0 - h );
}

// ---

struct Camera {
  vec3 pos;
  vec3 dir;
  vec3 sid;
  vec3 top;
};

struct Ray {
  vec3 dir;
  vec3 ori;
  bool inside;
};

struct Material {
  vec3 color;
  vec3 emissive;

  float reflective;
  float reflectiveRoughness;
  float refractive;
  float refractiveIndex;
};

struct Map {
  float dist;
  Material material;
};

struct March {
  Ray ray;
  Map map;
  float len;
  vec3 pos;
};

// ---

Camera camInit( in vec3 _pos, in vec3 _tar ) {
  Camera cam;
  cam.pos = _pos;
  cam.dir = normalize( _tar - _pos );
  cam.sid = normalize( cross( cam.dir, V.xyx ) );
  cam.top = normalize( cross( cam.sid, cam.dir ) );

  return cam;
}

Map distFunc( in vec3 _p );
Ray rayInit( in vec3 _ori, in vec3 _dir ) {
  Ray ray;
  ray.dir = _dir;
  ray.ori = _ori;
  ray.inside = distFunc( ray.ori ).dist < 0.0;
  return ray;
}

Ray rayFromCam( in vec2 _p, in Camera _cam ) {
  vec3 dir = normalize( _p.x * _cam.sid + _p.y * _cam.top + _cam.dir );
  return rayInit( _cam.pos, dir );
}

Material mtlInit( in vec3 _col ) {
  Material material;
  material.color = _col;
  material.emissive = V.xxx;

  material.reflective = 0.0;
  material.reflectiveRoughness = 0.0;
  material.refractive = 0.0;
  material.refractiveIndex = 1.0;
  return material;
}

Map mapInit( in float _dist ) {
  Map map;
  map.dist = _dist;
  map.material = mtlInit( V.xxx );
  return map;
}

March marchInit( in Ray _ray ) {
  March march;
  march.ray = _ray;
  march.len = INIT_LEN;
  march.pos = _ray.ori + _ray.dir * march.len;
  return march;
}

// ---

float sphere( in vec3 _p, in float _r ) {
  return length( _p ) - _r;
}

float box( in vec3 _pos, in vec3 _size ) {
  vec3 d = abs( _pos ) - _size;
  return min( max( d.x, max( d.y, d.z ) ), 0.0 ) + length( max( d, 0.0 ) );
}

float tri( in vec3 _p, in float _size ) {
  vec3 q = abs( _p );
  return max( q.x * 0.866025 + _p.y * 0.5, -_p.y ) - _size * 0.5;
}

float slasher( vec3 _p, float _density, float _ratio ) {
  float phase = ( _p.x + _p.y ) * _density;
  float slash = abs( 0.5 - ( phase - floor( phase ) ) ) * 2.0;
  return ( slash - _ratio ) / _density / sqrt( 3.0 );
}

vec3 word( vec3 _p, sampler2D _tex, float _size, float _ext, float _bold ) {
  vec3 pos = _p;
  if ( box( pos, vec2( 0.5 * _size, _ext * 2.0 ).xxy ) < 0.0 ) {
    vec4 tex = V.xxxx;
    for ( int iy = -1; iy < 2; iy ++ ) {
      for ( int ix = -1; ix < 2; ix ++ ) {
        vec2 coord = 0.5 + pos.xy / _size + vec2( ix, iy ) / 2048.0;
        tex += texture2D( _tex, coord ) / 9.0;
      }
    }
    vec2 distXY = vec2(
      ( ( tex.x - 0.5 ) - _bold ) * _size / 8.0,
      abs( pos.z ) - _ext
    );

    float dist = min( max( distXY.x, distXY.y ), 0.0 ) + length( max( distXY, 0.0 ) );
    return vec3( dist, distXY );
  } else {
    return vec3( box( pos, vec2( 0.5 * _size, _ext * 2.0 ).xxy * 0.9 ), 0.0, 0.0 );
  }
}

vec3 ifs( vec3 _p, vec3 _rot, vec3 _shift ) {
  vec3 pos = _p;

  vec3 shift = _shift;

  for ( int i = 0; i < IFS_ITER; i ++ ) {
    float intensity = pow( 2.0, -float( i ) );

    pos.y -= 0.0;

    pos = abs( pos )
      - shift
      * intensity;

    shift.yz = rotate2D( _rot.x ) * shift.yz;
    shift.zx = rotate2D( _rot.y ) * shift.zx;
    shift.xy = rotate2D( _rot.z ) * shift.xy;

    if ( pos.x < pos.y ) { pos.xy = pos.yx; }
    if ( pos.x < pos.z ) { pos.xz = pos.zx; }
    if ( pos.y < pos.z ) { pos.yz = pos.zy; }
  }

  return pos;
}

Map distFunc( in vec3 _p, in float _time ) {
  Map map = mapInit( 1E9 );

  float shake = pow( max( time - 0.5, 0.0 ) * 8.0, 2.0 ) * 0.1;

  { // almost
    vec3 p = _p;

    p.y -= exp( -time * 20.0 ) * 10.0;
    p -= vec3(
      sin( time * 434.9 ),
      sin( time * 712.8 ),
      sin( time * 523.6 ) * 0.1
    ) * shake;

    p -= vec3( -1.0, 2.0, 0.0 );
    float dist = word( p, textureWordAlmost, 4.8, 0.1, 0.0 ).x;

    if ( dist < map.dist ) {
      map = mapInit( dist );
      map.material = mtlInit( V.yyy * 1.0 );
    }
  }

  { // halfway
    vec3 p = _p;

    p.x -= exp( -time * 20.0 ) * 10.0;
    p -= vec3(
      sin( time * 534.9 ),
      sin( time * 247.8 ),
      sin( time * 845.6 ) * 0.1
    ) * shake;

    p -= vec3( 0.0, 0.7, 0.0 );
    float dist = word( p, textureWordHalfway, 6.5, 0.1, 0.0 ).x;

    if ( dist < map.dist ) {
      map = mapInit( dist );
      map.material = mtlInit( V.yyy * 1.0 );
    }
  }

  { // through
    vec3 p = _p;

    p.x -= -exp( -time * 20.0 ) * 10.0;
    p -= vec3(
      sin( time * 639.4 ),
      sin( time * 267.1 ),
      sin( time * 559.3 ) * 0.1
    ) * shake;

    p -= vec3( -1.4, -0.4, 0.0 );
    float dist = word( p, textureWordThrough, 3.2, 0.1, 0.0 ).x;

    if ( dist < map.dist ) {
      map = mapInit( dist );
      map.material = mtlInit( V.yyy * 1.0 );
    }
  }

  { // 2016
    vec3 p = _p;

    p.y -= -exp( -time * 20.0 ) * 10.0;
    p -= vec3(
      sin( time * 416.4 ),
      sin( time * 733.9 ),
      sin( time * 252.6 ) * 0.1
    ) * shake;

    p -= vec3( -0.8, -1.8, 0.0 );
    float dist = word( p, textureWord2016, 8.0, 0.1, 0.0 ).x;

    if ( dist < map.dist ) {
      map = mapInit( dist );
      map.material = mtlInit( V.yyy * 1.0 );
    }
  }

  { // light
    vec3 p = _p;
    p -= vec3( 10.0, 30.0, 20.0 );

    float dist = sphere( p, 20.0 );

    if ( dist < map.dist ) {
      map = mapInit( dist );
      map.material = mtlInit( vec3( 0.4 ) );
      map.material.emissive = vec3( 0.6, 0.7, 0.9 ) * 20.0;
    }
  }

  return map;
}

Map distFunc( in vec3 _p ) {
  return distFunc( _p, time );
}

vec3 normalFunc( in vec3 _p, in float _d ) {
  vec2 d = V * _d;
  return normalize( vec3(
    distFunc( _p + d.yxx ).dist - distFunc( _p - d.yxx ).dist,
    distFunc( _p + d.xyx ).dist - distFunc( _p - d.xyx ).dist,
    distFunc( _p + d.xxy ).dist - distFunc( _p - d.xxy ).dist
  ) );
}

// ---

March march( in Ray _ray ) {
  Ray ray = _ray;
  March march = marchInit( ray );

  for ( int iMarch = 0; iMarch < MARCH_ITER; iMarch ++ ) {
    Map map = distFunc( march.pos );
    map.dist *= ( ray.inside ? -1.0 : 1.0 ) * 0.8;

    march.map = map;
    march.len += map.dist;
    march.pos = ray.ori + ray.dir * march.len;

    if ( 1E3 < march.len || abs( map.dist ) < INIT_LEN * 0.01 ) { break; }
  }

  return march;
}

// ---

vec3 randomHemisphere( in vec3 _normal ) {
  vec3 dir = V.xxx;
  for ( int i = 0; i < 9; i ++ ) {
    dir = random().xyz * 2.0 - 1.0;
    if ( length( dir ) < 1.0 ) { break; }
  }
  dir = normalize( dir );
  if ( dot( dir, _normal ) < 0.0 ) { dir = -dir; }
  return dir;
}

Ray shade( in March _march ) {
  March march = _march;

  if ( abs( march.map.dist ) < 1E-2 ) {
    bool inside = march.ray.inside;
    vec3 normal = normalFunc( march.pos, 1E-4 );

    normal = inside ? -normal : normal;
    Material material = march.map.material;

    vec3 dir = V.xxx;
    float dice = random().x;

    color += amp * max( 0.0, dot( normal, -march.ray.dir ) ) * march.map.material.emissive;
    amp *= march.map.material.color;

    if ( dice < material.reflective ) { // reflect
      vec3 ref = normalize( reflect(
        march.ray.dir,
        normal
      ) );
      vec3 dif = randomHemisphere( normal );
      dir = normalize( mix(
        ref,
        dif,
        material.reflectiveRoughness
      ) );
      amp *= max( dot( dir, dif ), 0.0 );

    } else if ( dice < material.reflective + material.refractive ) { // refract
      vec3 inc = normalize( march.ray.dir );
      bool toAir = ( 0.0 < dot( normal, inc ) );
      float eta = 1.0 / march.map.material.refractiveIndex;
      eta = inside ? 1.0 / eta : eta;

      dir = refract(
        inc,
        toAir ? -normal : normal,
        toAir ? 1.0 / eta : eta
      );
      dir = ( dir == V.xxx )
      ? ( normalize( reflect(
        march.ray.dir,
        normal
      ) ) )
      : normalize( dir );
      inside = !inside;

    } else { // diffuse
      dir = randomHemisphere( normal );
      amp *= max( dot( dir, normal ), 0.0 );
    }

    Ray ray = rayInit( march.pos, dir );
    ray.inside = inside;
    return ray;
  } else {
    color += amp * SKY_COLOR;
    amp *= 0.0;

    return rayInit( V.xxx, V.xxx );
  }
}

// ---

void main() {
  seed = texture2D( textureRandom, gl_FragCoord.xy / resolution );

  vec3 sum = V.xxx;

  for ( int iSample = 0; iSample < NSAMPLE; iSample ++ ) {
    Camera cam = camInit(
      vec3( 0.0, 0.0, 4.0 ),
      vec3( 0.0, 0.0, 0.0 )
    );
    cam.pos += ( random().y - 0.5 ) * 0.01 * cam.sid;
    cam.pos += ( random().y - 0.5 ) * 0.01 * cam.top;

    cam.pos.z -= exp( -time * 20.0 ) * 4.0;

    vec3 tempSid = cam.sid;
    vec3 tempTop = cam.top;

    cam.sid = cos( exp( -time * 20.0 ) ) * tempSid - sin( exp( -time * 30.0 ) ) * tempTop;
    cam.top = sin( exp( -time * 20.0 ) ) * tempSid + cos( exp( -time * 30.0 ) ) * tempTop;

    vec2 pix = gl_FragCoord.xy + random().xy - 0.5;
    vec2 p = ( pix * 2.0 - resolution ) / resolution.x;
    Ray ray = rayFromCam( p, cam );

    color = V.xxx;
    amp = V.yyy;

    for ( int iRef = 0; iRef < NREF; iRef ++ ) {
      ray = shade( march( ray ) );

      if ( length( amp ) < RAYAMP_MIN ) { break; }
    }

    sum += color / float( NSAMPLE );
  }

  gl_FragColor = vec4( sum, 1.0 );
}
