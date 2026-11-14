<?php
// Generate responsive copies; the original official image remains untouched.
$source = imagecreatefrompng(__DIR__ . '/../public/images/escudo.png');
foreach ([128, 256] as $width) {
    $height = (int) round(imagesy($source) * $width / imagesx($source));
    $copy = imagecreatetruecolor($width, $height);
    imagealphablending($copy, false);
    imagesavealpha($copy, true);
    imagefill($copy, 0, 0, imagecolorallocatealpha($copy, 0, 0, 0, 127));
    imagecopyresampled($copy, $source, 0, 0, 0, 0, $width, $height, imagesx($source), imagesy($source));
    imagewebp($copy, __DIR__ . '/../public/images/escudo-' . $width . '.webp', 90);
    imagedestroy($copy);
}
imagedestroy($source);
