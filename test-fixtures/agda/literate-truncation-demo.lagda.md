# Truncation demo

Block 1 defines the datatype every later block needs.

```agda
data N : Set where
  z : N
  s : N -> N
```

Block 2 has a goal that refers to `one`, which is only defined in block 3
below -- running a command from here must NOT see it.

```agda
test : N
test = {! one !}
```

Block 3 defines `one`, and has its own goal that successfully uses it
(defined earlier in the same block).

```agda
one : N
one = s z

test2 : N
test2 = {! one !}
```
