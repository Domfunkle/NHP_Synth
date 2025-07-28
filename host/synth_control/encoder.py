
"""
Encoder abstraction for physical I2C rotary encoder with button and pixel LED.
"""

class Encoder:
    def __init__(self, hardware_encoder, button=None, pixel=None):
        """
        :param hardware_encoder: The physical encoder object (already initialized, e.g. from system_initializer.py)
        :param pixel: Optional pixel LED object associated with this encoder
        """
        self._encoder = hardware_encoder
        self._button = button
        self._pixel = pixel
        self._last_position = self.position
        self._button_last = self.button_pressed

    @property
    def position(self):
        """Return the current position of the encoder (int)."""
        return getattr(self._encoder, 'position', 0)

    @property
    def delta(self):
        """Return the change in position since last check."""
        pos = self.position
        d = pos - self._last_position
        self._last_position = pos
        return d
    
    @property
    def button_pressed(self):
        return not self._button.value

    def button_was_pressed(self):
        """Return True if the button transitioned from not pressed to pressed since last check."""
        current = self.button_pressed
        was_pressed = current and not self._button_last
        self._button_last = current
        return was_pressed

    def set_pixel(self, color):
        """Set the pixel LED to the given color (tuple of RGB)."""
        if self._pixel:
            self._pixel.fill(color)

    def clear_pixel(self):
        """Turn off the pixel LED."""
        if self._pixel:
            self._pixel.fill((0, 0, 0))
