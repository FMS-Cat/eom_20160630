let word = function( _str ) {
  let canvas = document.createElement( 'canvas' );
  let canvasSize = 2048;
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  let context = canvas.getContext( '2d' );
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 ' + canvasSize / 4.0 + 'px "Helvetica Neue", "Helvetica Neue OTS"';

  context.fillStyle = '#000';
  context.fillRect( 0, 0, canvasSize, canvasSize );

  context.fillStyle = '#fff';
  context.fillText( _str, canvasSize / 2.0, canvasSize / 2.0 );

  return canvas;
};

export default word;
