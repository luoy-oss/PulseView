use wasm_bindgen::prelude::*;

mod acceleration;
mod compute;
mod decimation;
mod encoder;

pub use acceleration::*;
pub use compute::*;
pub use decimation::*;
pub use encoder::*;

#[wasm_bindgen]
pub fn wasm_smoke_add(left: f64, right: f64) -> f64 {
    left + right
}

#[cfg(test)]
mod lib_tests;
