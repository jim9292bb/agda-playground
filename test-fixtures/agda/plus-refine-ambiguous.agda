data N : Set where
  z : N
  s : N -> N

_+_ : N -> N -> N
z + b = b
s a + b = {!  !}
