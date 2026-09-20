# stepper rows

A stack of labelled numeric controls, one per row: label on the left, then the value and a `-` and
`+` pair pinned to the right. Built from `.run-controls` for the row with the `.stepper` modifier, `.field-label` for the
caption, `.spacer` to push the rest right, `.field-value` for the readout and `.toggle` for the two
buttons. `.stepper` fixes the gap, the button padding and a right-aligned readout width.

```html
<div class="run-controls stepper" data-stepper="alpha">
  <span class="field-label">alpha</span>
  <span class="spacer"></span>
  <span class="field-value">3</span>
  <div class="toggle" data-step="-1">-</div>
  <div class="toggle" data-step="1">+</div>
</div>
```

One handler on the stack covers every row: read `data-stepper` for which value, `data-step` for the
direction, clamp, then rewrite the `.field-value`. Clamping belongs in the handler, not the markup.

Wrong shape when the value is a position in a range - use `makeSlider` there.

Live example: the stepper rows block in `demo/index.html`, menus panel.
